// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/arg/mattermost-readreceipts/server/store"
	"github.com/arg/mattermost-readreceipts/server/types"
	_ "github.com/lib/pq"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

type receiptStore interface {
	Initialize() error
	InitializeChannelReads() error
	SaveReceipt(store.ReadEvent) error
	GetForPosts(string, []string, int64) ([]store.ReadEvent, error)
	GetByChannel(string, string) ([]store.ReadEvent, error)
	GetChannelReads(string) ([]types.ChannelRead, error)
	GetReadersSince(string, int64, string) ([]string, error)
	CleanupOlderThan(int) error
}

type Plugin struct {
	plugin.MattermostPlugin
	store             receiptStore
	dbConnection      *sql.DB
	configurationLock sync.RWMutex
	conf              *Configuration
	stopCh            chan struct{}
	lifecycleLock     sync.Mutex
	workers           sync.WaitGroup
}

func (p *Plugin) getConfiguration() *Configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	if p.conf == nil {
		return getDefaultConfiguration()
	}
	clone := *p.conf
	return &clone
}

func (p *Plugin) OnConfigurationChange() error {
	cfg := getDefaultConfiguration()
	if err := p.API.LoadPluginConfiguration(cfg); err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	cfg.LogLevel = strings.ToLower(cfg.LogLevel)
	if err := cfg.IsValid(); err != nil {
		return err
	}
	p.configurationLock.Lock()
	p.conf = cfg
	p.configurationLock.Unlock()
	return nil
}

func (p *Plugin) OnActivate() error {
	p.lifecycleLock.Lock()
	defer p.lifecycleLock.Unlock()
	if p.dbConnection != nil {
		return nil
	}
	if err := p.OnConfigurationChange(); err != nil {
		return err
	}
	cfg := p.API.GetUnsanitizedConfig()
	if cfg == nil || cfg.SqlSettings.DriverName == nil || cfg.SqlSettings.DataSource == nil {
		return fmt.Errorf("database configuration unavailable")
	}
	if *cfg.SqlSettings.DriverName != "postgres" {
		return fmt.Errorf("this release requires PostgreSQL")
	}
	db, err := sql.Open("postgres", *cfg.SqlSettings.DataSource)
	if err != nil {
		return fmt.Errorf("open PostgreSQL connection")
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(time.Hour)
	for attempt := 0; attempt < 5; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err = db.PingContext(ctx)
		cancel()
		if err == nil {
			break
		}
		if attempt < 4 {
			time.Sleep(time.Second)
		}
	}
	if err != nil {
		db.Close()
		return fmt.Errorf("PostgreSQL connection unavailable after retries")
	}
	s := store.NewPostgresStore(db)
	if err = s.Initialize(); err == nil {
		err = s.InitializeChannelReads()
	}
	if err != nil {
		db.Close()
		return fmt.Errorf("initialize receipt schema: %w", err)
	}
	p.store, p.dbConnection = s, db
	p.stopCh = make(chan struct{})
	p.workers.Add(1)
	go p.runMaintenance(p.stopCh, db)
	p.API.LogInfo("Read Receipts activated", "version", "1.1.2")
	return nil
}

// database/sql reconnects automatically; never recursively reactivate the plugin.
func (p *Plugin) runMaintenance(stop <-chan struct{}, db *sql.DB) {
	defer p.workers.Done()
	health := time.NewTicker(time.Minute)
	cleanup := time.NewTicker(time.Hour)
	defer health.Stop()
	defer cleanup.Stop()
	for {
		select {
		case <-stop:
			return
		case <-health.C:
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := db.PingContext(ctx)
			cancel()
			if err != nil {
				p.API.LogWarn("Read Receipts database temporarily unavailable")
			}
		case <-cleanup.C:
			if err := p.CleanupOldReceipts(); err != nil {
				p.API.LogError("Receipt cleanup failed")
			}
		}
	}
}

func (p *Plugin) CleanupOldReceipts() error {
	cfg := p.getConfiguration()
	// Cleanup is explicitly opt-in so an upgrade preserves historical receipts.
	if !cfg.Enable || !cfg.EnableCleanup || cfg.RetentionDays <= 0 || p.store == nil {
		return nil
	}
	return p.store.CleanupOlderThan(cfg.RetentionDays)
}

func (p *Plugin) OnDeactivate() error {
	p.lifecycleLock.Lock()
	defer p.lifecycleLock.Unlock()
	if p.stopCh != nil {
		close(p.stopCh)
		p.stopCh = nil
	}
	p.workers.Wait()
	if p.dbConnection != nil {
		err := p.dbConnection.Close()
		p.dbConnection = nil
		return err
	}
	return nil
}

func (p *Plugin) logDebug(msg string, kv ...interface{}) {
	if p.getConfiguration().LogLevel == "debug" {
		p.API.LogDebug(msg, kv...)
	}
}
func (p *Plugin) logInfo(msg string, kv ...interface{}) {
	if p.getConfiguration().LogLevel != "error" {
		p.API.LogInfo(msg, kv...)
	}
}
func (p *Plugin) logError(msg string, kv ...interface{}) { p.API.LogError(msg, kv...) }

const (
	EventReadReceipt    = "read_receipt"
	EventChannelReaders = "channel_readers"
)
