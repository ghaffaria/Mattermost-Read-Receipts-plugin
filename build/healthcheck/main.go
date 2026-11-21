// A shell-free HTTP probe for Mattermost's distroless container.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://127.0.0.1:8065/api/v4/system/ping")
	if err != nil {
		fmt.Fprintln(os.Stderr, "Mattermost HTTP probe failed:", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	var result struct {
		Status string `json:"status"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&result) != nil || result.Status != "OK" {
		fmt.Fprintln(os.Stderr, "Mattermost HTTP probe returned an unhealthy response")
		os.Exit(1)
	}
}
