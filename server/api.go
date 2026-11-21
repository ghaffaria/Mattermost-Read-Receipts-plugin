package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/arg/mattermost-readreceipts/server/store"
	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/debug/ping", p.HandlePing).Methods(http.MethodGet)
	api := router.PathPrefix("/api/v1").Subrouter()
	api.Use(p.MattermostAuthorizationRequired)
	api.HandleFunc("/read", p.HandleReadReceipt).Methods(http.MethodPost)
	api.HandleFunc("/receipts", p.HandleGetReceipts).Methods(http.MethodGet)
	api.HandleFunc("/config", p.HandleGetConfig).Methods(http.MethodGet)
	api.HandleFunc("/channel/{channelID}/reads", p.HandleGetChannelReads).Methods(http.MethodGet)
	api.HandleFunc("/channel/{channelID}/readers", p.HandleGetChannelReaders).Methods(http.MethodGet)
	api.HandleFunc("/read/channel/{channelID}", p.HandleGetReadersSince).Methods(http.MethodGet)
	api.HandleFunc("/debug/db", p.HandleDBCheck).Methods(http.MethodGet)
	router.ServeHTTP(w, r)
}
func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (p *Plugin) allowed(w http.ResponseWriter, r *http.Request, channelID string) bool {
	if channelID == "" {
		http.Error(w, "channel_id is required", 400)
		return false
	}
	if !p.API.HasPermissionToChannel(r.Header.Get("Mattermost-User-ID"), channelID, model.PermissionReadChannel) {
		http.Error(w, "Forbidden", 403)
		return false
	}
	return true
}
func (p *Plugin) ready(w http.ResponseWriter) bool {
	if !p.getConfiguration().Enable {
		http.Error(w, "Read receipts disabled", 503)
		return false
	}
	if p.store == nil {
		http.Error(w, "Receipt store unavailable", 503)
		return false
	}
	return true
}
func (p *Plugin) HandlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok", "version": "1.1.1"})
}
func (p *Plugin) HandleDBCheck(w http.ResponseWriter, r *http.Request) {
	if !p.API.HasPermissionTo(r.Header.Get("Mattermost-User-ID"), model.PermissionManageSystem) {
		http.Error(w, "Forbidden", 403)
		return
	}
	if !p.ready(w) {
		return
	}
	if _, err := p.store.GetByChannel("", ""); err != nil {
		http.Error(w, "Database unavailable", 503)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}
func (p *Plugin) HandleReadReceipt(w http.ResponseWriter, r *http.Request) {
	if !p.ready(w) {
		return
	}
	var req ReadRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil || req.MessageID == "" {
		http.Error(w, "Invalid receipt", 400)
		return
	}
	post, err := p.API.GetPost(req.MessageID)
	if err != nil || post == nil || post.DeleteAt != 0 {
		http.Error(w, "Invalid message", 400)
		return
	}
	if req.ChannelID != "" && req.ChannelID != post.ChannelId {
		http.Error(w, "Message/channel mismatch", 400)
		return
	}
	if !p.allowed(w, r, post.ChannelId) {
		return
	}
	userID := r.Header.Get("Mattermost-User-ID")
	// Sending a post does not constitute a read by its audience.
	if userID == post.UserId {
		writeJSON(w, map[string]string{"status": "ok"})
		return
	}
	event := store.ReadEvent{MessageID: post.Id, UserID: userID, ChannelID: post.ChannelId, Timestamp: time.Now().UnixMilli()}
	if err := p.store.SaveReceipt(event); err != nil {
		p.logError("Failed to save receipt")
		http.Error(w, "Failed to save receipt", 500)
		return
	}
	// Broadcast only after the transaction commits. Every session of the reader
	// also receives the update, keeping multi-device state coherent.
	p.API.PublishWebSocketEvent(EventReadReceipt, map[string]interface{}{
		"MessageID": post.Id, "UserID": userID, "ChannelID": post.ChannelId, "Timestamp": event.Timestamp,
	}, &model.WebsocketBroadcast{ChannelId: post.ChannelId})
	writeJSON(w, map[string]string{"status": "ok"})
}
func (p *Plugin) HandleGetReceipts(w http.ResponseWriter, r *http.Request) {
	if !p.ready(w) {
		return
	}
	channelID := r.URL.Query().Get("channel_id")
	if !p.allowed(w, r, channelID) {
		return
	}
	since, err := p.getSinceMillis(r)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	var ids []string
	if raw := r.URL.Query().Get("post_ids"); raw != "" {
		ids = strings.Split(raw, ",")
		if len(ids) > 200 {
			http.Error(w, "Too many posts", 400)
			return
		}
	}
	events, err := p.store.GetForPosts(channelID, ids, since)
	if err != nil {
		http.Error(w, "Unable to load receipts", 500)
		return
	}
	if events == nil {
		events = []store.ReadEvent{}
	}
	writeJSON(w, events)
}
func (p *Plugin) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := p.getConfiguration()
	writeJSON(w, map[string]interface{}{
		"enable": cfg.Enable, "visibility_threshold_ms": cfg.VisibilityThresholdMs,
		"retention_days": cfg.RetentionDays, "enable_cleanup": cfg.EnableCleanup, "log_level": cfg.LogLevel,
	})
}
func (p *Plugin) HandleGetChannelReads(w http.ResponseWriter, r *http.Request) {
	if !p.ready(w) {
		return
	}
	channelID := mux.Vars(r)["channelID"]
	if !p.allowed(w, r, channelID) {
		return
	}
	reads, err := p.store.GetChannelReads(channelID)
	if err != nil {
		http.Error(w, "Unable to load reads", 500)
		return
	}
	if reads == nil {
		writeJSON(w, []interface{}{})
		return
	}
	writeJSON(w, reads)
}
func (p *Plugin) readers(w http.ResponseWriter, r *http.Request, wrapped bool) {
	if !p.ready(w) {
		return
	}
	channelID := mux.Vars(r)["channelID"]
	if !p.allowed(w, r, channelID) {
		return
	}
	since, err := p.getSinceMillis(r)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	readers, err := p.store.GetReadersSince(channelID, since, r.Header.Get("Mattermost-User-ID"))
	if err != nil {
		http.Error(w, "Unable to load readers", 500)
		return
	}
	if readers == nil {
		readers = []string{}
	}
	if wrapped {
		writeJSON(w, map[string]interface{}{"user_ids": readers})
	} else {
		writeJSON(w, readers)
	}
}
func (p *Plugin) HandleGetReadersSince(w http.ResponseWriter, r *http.Request) {
	p.readers(w, r, false)
}
func (p *Plugin) HandleGetChannelReaders(w http.ResponseWriter, r *http.Request) {
	p.readers(w, r, true)
}
func (p *Plugin) getSinceMillis(r *http.Request) (int64, error) {
	if s := r.URL.Query().Get("since"); s != "" {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil || n < 0 {
			return 0, &parameterError{}
		}
		return n, nil
	}
	if id := r.URL.Query().Get("postID"); id != "" {
		post, err := p.API.GetPost(id)
		if err != nil || post.ChannelId != r.URL.Query().Get("channel_id") && post.ChannelId != mux.Vars(r)["channelID"] {
			return 0, &parameterError{}
		}
		return post.CreateAt, nil
	}
	return 0, nil
}

type parameterError struct{}

func (*parameterError) Error() string { return "Invalid since/postID parameter" }
