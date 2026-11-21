// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

package main

import (
	"github.com/mattermost/mattermost-server/v6/plugin"
	// import your plugin type
)

func main() {
	plugin.ClientMain(&Plugin{})
}
