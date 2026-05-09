// Package main demonstrates using the ShowAd SDK with the Go standard library.
//
// Run with:
//
//	SHOWAD_CREATOR=... SHOWAD_API_KEY=... SHOWAD_REDIRECT_SECRET=... \
//	  go run ./examples/stdlib
package main

import (
	"log"
	"net/http"
	"os"

	showad "github.com/proofmark/showad-go"
)

func main() {
	client, err := showad.NewClient(showad.Config{
		CreatorHash:    os.Getenv("SHOWAD_CREATOR"),
		APIKey:         os.Getenv("SHOWAD_API_KEY"),
		RedirectSecret: os.Getenv("SHOWAD_REDIRECT_SECRET"),
	})
	if err != nil {
		log.Fatalf("showad: %v", err)
	}

	protect := client.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/premium/*"},
		ExcludePaths:   []string{"/api/health"},
		AccessPolicy: &showad.AccessPolicy{
			TrustedIPHeaders: []string{"CF-Connecting-IP", "X-Forwarded-For"},
			AllowCIDRs:       []string{"10.0.0.0/8"},
			Crawler: &showad.CrawlerPolicy{
				Enabled:                 true,
				AllowCloudflareVerified: true,
			},
		},
	})

	mux := http.NewServeMux()
	mux.Handle("/premium/", protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("premium content"))
	})))
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":8080"
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
