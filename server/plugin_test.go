package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/arg/mattermost-readreceipts/server/store"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin/plugintest"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

type memoryReceipts struct {
	receiptStore
	events       []store.ReadEvent
	saveErr      error
	cleanupCalls int
}

func (m *memoryReceipts) SaveReceipt(e store.ReadEvent) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	m.events = append(m.events, e)
	return nil
}
func (m *memoryReceipts) GetForPosts(_ string, _ []string, _ int64) ([]store.ReadEvent, error) {
	return m.events, nil
}
func (m *memoryReceipts) CleanupOlderThan(_ int) error { m.cleanupCalls++; return nil }
func fixture() (*Plugin, *plugintest.API, *memoryReceipts) {
	api := &plugintest.API{}
	s := &memoryReceipts{}
	p := &Plugin{store: s, conf: getDefaultConfiguration()}
	p.SetAPI(api)
	return p, api, s
}
func request(p *Plugin, method, path, body, user string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if user != "" {
		r.Header.Set("Mattermost-User-ID", user)
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, r)
	return w
}
func TestAuthentication(t *testing.T) {
	p, _, _ := fixture()
	require.Equal(t, 401, request(p, "GET", "/api/v1/config", "", "").Code)
	require.Equal(t, 200, request(p, "GET", "/api/v1/debug/ping", "", "").Code)
}
func TestReceiptAuthorizationAndAtomicSuccess(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		allowed    bool
		saveErr    error
		code       int
	}{
		{"success", "{\"message_id\":\"post\",\"channel_id\":\"channel\"}", true, nil, 200},
		{"infer-channel", "{\"message_id\":\"post\"}", true, nil, 200},
		{"mismatch", "{\"message_id\":\"post\",\"channel_id\":\"other\"}", true, nil, 400},
		{"forbidden", "{\"message_id\":\"post\"}", false, nil, 403},
		{"database-failure", "{\"message_id\":\"post\"}", true, errors.New("offline"), 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, api, s := fixture()
			s.saveErr = tc.saveErr
			api.On("GetPost", "post").Return(&model.Post{Id: "post", ChannelId: "channel", UserId: "author"}, nil)
			if tc.code != 400 {
				api.On("HasPermissionToChannel", "reader", "channel", model.PermissionReadChannel).Return(tc.allowed)
			}
			if tc.saveErr != nil {
				api.On("LogError", mock.Anything, mock.Anything).Return()
			}
			if tc.code == 200 {
				api.On("PublishWebSocketEvent", "read_receipt", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
					require.Len(t, s.events, 1, "persist before broadcast")
					require.Equal(t, "channel", args.Get(2).(*model.WebsocketBroadcast).ChannelId)
				}).Return()
			}
			w := request(p, "POST", "/api/v1/read", tc.body, "reader")
			require.Equal(t, tc.code, w.Code, w.Body.String())
			if tc.code == 200 {
				require.Equal(t, "reader", s.events[0].UserID)
				require.Greater(t, s.events[0].Timestamp, int64(1000000000000))
			}
			api.AssertExpectations(t)
		})
	}
}
func TestGetEmptyReceiptsAndForbiddenChannel(t *testing.T) {
	for _, allow := range []bool{true, false} {
		p, api, _ := fixture()
		api.On("HasPermissionToChannel", "reader", "channel", model.PermissionReadChannel).Return(allow)
		w := request(p, "GET", "/api/v1/receipts?channel_id=channel", "", "reader")
		if allow {
			require.Equal(t, 200, w.Code)
			require.JSONEq(t, "[]", w.Body.String())
		} else {
			require.Equal(t, 403, w.Code)
		}
	}
}
func TestConfigLowercaseAndZeroThreshold(t *testing.T) {
	p, api, _ := fixture()
	api.On("LoadPluginConfiguration", mock.Anything).Run(func(args mock.Arguments) {
		require.NoError(t, json.Unmarshal([]byte("{\"enable\":true,\"visibilitythresholdms\":0,\"retentiondays\":14,\"loglevel\":\"DEBUG\",\"enablecleanup\":false}"), args.Get(0)))
	}).Return(nil)
	require.NoError(t, p.OnConfigurationChange())
	cfg := p.getConfiguration()
	require.Zero(t, cfg.VisibilityThresholdMs)
	require.Equal(t, 14, cfg.RetentionDays)
	require.Equal(t, "debug", cfg.LogLevel)
}
func TestDisabledAndCleanupOptIn(t *testing.T) {
	p, _, s := fixture()
	require.NoError(t, p.CleanupOldReceipts())
	require.Zero(t, s.cleanupCalls)
	p.conf.EnableCleanup = true
	require.NoError(t, p.CleanupOldReceipts())
	require.Equal(t, 1, s.cleanupCalls)
	p.conf.RetentionDays = 0
	require.NoError(t, p.CleanupOldReceipts())
	require.Equal(t, 1, s.cleanupCalls)
	p.conf.Enable = false
	require.Equal(t, 503, request(p, http.MethodPost, "/api/v1/read", "{}", "reader").Code)
}
func TestInvalidReceiptAndSince(t *testing.T) {
	p, api, _ := fixture()
	require.Equal(t, 400, request(p, "POST", "/api/v1/read", "{", "reader").Code)
	api.On("HasPermissionToChannel", "reader", "channel", model.PermissionReadChannel).Return(true)
	require.Equal(t, 400, request(p, "GET", "/api/v1/receipts?channel_id=channel&since=-1", "", "reader").Code)
}
