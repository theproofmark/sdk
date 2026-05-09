//go:build ignore

// Example: using ShowAd protect middleware with gin-gonic/gin.
//
//	go run ./examples/gin
//
// This file is build-tagged with `ignore` so the example does not force
// gin as a dependency on the main module.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

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

	// Wrap the standard middleware factory for gin's HandlerFunc model.
	ginAdapter := func(c *gin.Context) {
		next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			c.Next()
		})
		protect(next).ServeHTTP(c.Writer, c.Request)
		if c.Writer.Status() >= 300 && c.Writer.Status() < 400 {
			c.Abort()
		}
	}

	r := gin.Default()
	r.GET("/premium/:slug", ginAdapter, func(c *gin.Context) {
		c.String(http.StatusOK, "premium content")
	})
	log.Fatal(r.Run(":8080"))
}
