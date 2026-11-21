// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

package main

import (
	"fmt"
	"strings"
)

// Mattermost lowercases manifest keys before decoding with encoding/json.
type Configuration struct {
	Enable                bool
	VisibilityThresholdMs int
	RetentionDays         int
	EnableCleanup         bool
	LogLevel              string
}

func getDefaultConfiguration() *Configuration {
	return &Configuration{Enable: true, VisibilityThresholdMs: 2000, RetentionDays: 30, LogLevel: "info"}
}
func (c *Configuration) IsValid() error {
	c.LogLevel = strings.ToLower(c.LogLevel)
	if c.VisibilityThresholdMs < 0 || c.VisibilityThresholdMs > 60000 {
		return fmt.Errorf("visibility threshold must be between 0 and 60000 ms")
	}
	if c.RetentionDays < 0 {
		return fmt.Errorf("retention days cannot be negative")
	}
	switch c.LogLevel {
	case "debug", "info", "error":
	default:
		return fmt.Errorf("invalid log level")
	}
	return nil
}
