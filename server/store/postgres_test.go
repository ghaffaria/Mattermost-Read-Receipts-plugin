// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

package store

import (
	"database/sql"
	"github.com/stretchr/testify/require"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

// This opt-in suite must only target an explicitly disposable database.
func TestPostgresReceiptLifecycle(t *testing.T) {
	dsn := os.Getenv("RR_POSTGRES_TEST_DSN")
	if dsn == "" {
		t.Skip("set RR_POSTGRES_TEST_DSN to the disposable rr_receipts_test database")
	}
	u, err := url.Parse(dsn)
	require.NoError(t, err)
	require.Equal(t, "/rr_receipts_test", u.Path, "refusing to touch an existing application database")
	db, err := sql.Open("postgres", dsn)
	require.NoError(t, err)
	defer db.Close()
	// Use a fresh private schema; cleanup cannot affect application tables.
	schema := "test_" + strings.ReplaceAll(time.Now().Format("150405.000000000"), ".", "")
	_, err = db.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	_, err = db.Exec("SET search_path TO " + schema)
	require.NoError(t, err)
	defer db.Exec("DROP SCHEMA " + schema + " CASCADE")
	_, err = db.Exec("CREATE TABLE posts(id TEXT PRIMARY KEY,channelid TEXT); INSERT INTO posts VALUES('old','channel'); CREATE TABLE read_events(message_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,timestamp BIGINT NOT NULL); INSERT INTO read_events VALUES('old','reader',1234)")
	require.NoError(t, err)
	s := NewPostgresStore(db)
	require.NoError(t, s.Initialize())
	require.NoError(t, s.InitializeChannelReads())
	require.NoError(t, s.Initialize(), "migration is idempotent")
	rows, err := s.GetForPosts("channel", []string{"old"}, 0)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, int64(1234), rows[0].Timestamp)
	require.NoError(t, s.SaveReceipt(ReadEvent{MessageID: "old", UserID: "second", ChannelID: "channel", Timestamp: 5000}))
	require.NoError(t, s.SaveReceipt(ReadEvent{MessageID: "old", UserID: "second", ChannelID: "channel", Timestamp: 6000}))
	rows, err = s.GetForPosts("channel", []string{"old"}, 0)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		if row.UserID == "second" {
			require.Equal(t, int64(5000), row.Timestamp, "first-read timestamp is retained")
		}
	}
	reads, err := s.GetChannelReads("channel")
	require.NoError(t, err)
	require.Len(t, reads, 1)
	require.Equal(t, int64(6000), reads[0].LastSeenAt)
	empty, err := s.GetForPosts("empty", nil, 0)
	require.NoError(t, err)
	require.NotNil(t, empty)
	require.Empty(t, empty)
	require.NoError(t, s.CleanupOlderThan(0))
	rows, err = s.GetForPosts("channel", nil, 0)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.NoError(t, s.CleanupOlderThan(30))
	rows, err = s.GetForPosts("channel", nil, 0)
	require.NoError(t, err)
	require.Empty(t, rows)
}
