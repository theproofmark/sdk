# ProofMark ShowAd SDK for Go

Content-gating middleware for ProofMark ShowAd, written in pure Go.

- Standard library only (no external dependencies).
- Drop-in `func(http.Handler) http.Handler` middleware works with `net/http`,
  `chi`, `gorilla/mux`, `gin`, `echo`, and any router that accepts a wrapper.
- Protocol-compatible with the Laravel and Next.js SDKs.

## Install

```bash
go get github.com/proofmark/showad-go
```

Requires Go 1.21+.

## Quick start (`net/http`)

```go
client, err := showad.NewClient(showad.Config{
    CreatorHash:    os.Getenv("SHOWAD_CREATOR_HASH"),
    APIKey:         os.Getenv("SHOWAD_API_KEY"),
    RedirectSecret: os.Getenv("SHOWAD_REDIRECT_SECRET"),
})
if err != nil {
    log.Fatal(err)
}

protect := client.Protect(showad.MiddlewareOptions{
    ProtectedPaths: []string{"/premium/*"},
    ExcludePaths:   []string{"/api/health"},
})

mux := http.NewServeMux()
mux.Handle("/premium/", protect(premiumHandler()))
mux.HandleFunc("/api/health", healthHandler)

http.ListenAndServe(":8080", mux)
```

## chi

```go
r := chi.NewRouter()
r.Route("/premium", func(r chi.Router) {
    r.Use(client.Protect(showad.MiddlewareOptions{
        ProtectedPaths: []string{"/premium/*"},
    }))
    r.Get("/article/{id}", premiumHandler)
})
```

## gorilla/mux

```go
r := mux.NewRouter()
sub := r.PathPrefix("/premium").Subrouter()
sub.Use(client.Protect(showad.MiddlewareOptions{
    ProtectedPaths: []string{"/premium/*"},
}))
sub.HandleFunc("/article/{id}", premiumHandler)
```

## gin

```go
protect := client.Protect(showad.MiddlewareOptions{
    ProtectedPaths: []string{"/premium/*"},
})

r := gin.Default()
r.Use(func(c *gin.Context) {
    next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { c.Next() })
    protect(next).ServeHTTP(c.Writer, c.Request)
    if c.Writer.Status() >= 300 && c.Writer.Status() < 400 {
        c.Abort()
    }
})
```

## echo

```go
protect := client.Protect(showad.MiddlewareOptions{ProtectedPaths: []string{"/premium/*"}})

e := echo.New()
e.Use(echo.WrapMiddleware(protect))
```

## Access policy

Run a server-side gate before any cookie/token check. UA matching alone never
bypasses access; verified-crawler decisions require an IP/CIDR proof or a
verified-bot header.

```go
protect := client.Protect(showad.MiddlewareOptions{
    ProtectedPaths: []string{"/premium/*"},
    AccessPolicy: &showad.AccessPolicy{
        TrustedIPHeaders: []string{"CF-Connecting-IP", "X-Forwarded-For"},
        AllowCIDRs:       []string{"10.0.0.0/8"},
        Crawler: &showad.CrawlerPolicy{
            Enabled:                 true,
            AllowCloudflareVerified: true,
            FamilyCIDRs: map[showad.CrawlerFamily][]string{
                "google": {"66.249.64.0/19"},
            },
        },
        BeforeProtect: func(r *http.Request, ctx showad.AccessContext) showad.AccessDecision {
            if isPremiumUser(r) {
                return showad.AccessDecision{Action: showad.ActionAllow, Reason: "premium"}
            }
            return showad.AccessDecision{Action: showad.ActionContinue}
        },
    },
})
```

## Manual API calls

```go
ticket, err := client.ClaimRedirectTicket(ctx, ticketID)
result, err := client.ValidateToken(ctx, jwt)
ok := client.CheckHealth(ctx)
```

## Testing

```bash
go vet ./...
go test ./...
```

## Examples

See `examples/` for runnable samples for `net/http`, `chi`, and `gin`.
The chi/gin examples are build-tagged with `ignore` so they do not force
those packages as dependencies of the main module.
