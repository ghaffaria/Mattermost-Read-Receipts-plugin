// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRuntimeVersionMatchesManifest(t *testing.T) {
	data, err := os.ReadFile("../plugin.json")
	require.NoError(t, err)
	var manifest struct {
		Version string `json:"version"`
	}
	require.NoError(t, json.Unmarshal(data, &manifest))
	require.Equal(t, manifest.Version, pluginVersion)
	p, _, _ := fixture()
	w := request(p, "GET", "/api/v1/debug/ping", "", "")
	require.JSONEq(t, `{"status":"ok","version":"`+pluginVersion+`"}`, w.Body.String())
}
