//go:build ignore

// Example: using ShowAd protect middleware with go-chi/chi.
//
//	go run ./examples/chi
//
// This file is build-tagged with `ignore` so the example does not force
// chi as a dependency on the main module.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	showad "github.com/proofmark/showad-go"
)

func main() {
	client, err := showad.NewClient(showad.Config{
		CreatorHash:    os.Getenv("SHOWAD_CREATOR"),
		APIKey:         os.Getenv("SHOWAD_API_KEY"),
		RedirectSecret: os.Getenv("SHOWAD_REDIRECT_SECRET"),
	})
	if err != nil {
		log.Fatal(err)
	}

	protect := client.Protect(showad.MiddlewareOptions{
		ProtectedPaths: []string{"/premium/*"},
	})

	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Route("/premium", func(r chi.Router) {
		r.Use(protect)
		r.Get("/article/{id}", func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("premium article"))
		})
	})

	log.Fatal(http.ListenAndServe(":8080", r))
}
