package showad

import (
	"net/url"
	"strconv"
	"strings"
)

// BuildVideoAdRedirectURL constructs the URL to the video ad page for a creator.
func BuildVideoAdRedirectURL(videoAdBaseURL, creatorHash, returnURL string) string {
	return buildAdURL(videoAdBaseURL, "/c/"+creatorHash, returnURL)
}

// BuildResourceRedirectURL constructs the URL to the video ad page for a specific resource.
func BuildResourceRedirectURL(videoAdBaseURL, creatorHash, projectHash, resourceHash, returnURL string) string {
	return buildAdURL(videoAdBaseURL, "/c/"+creatorHash+"/"+projectHash+"/"+resourceHash, returnURL)
}

func buildAdURL(base, path, returnURL string) string {
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || u.Scheme == "" {
		u = &url.URL{Scheme: "https", Host: strings.TrimPrefix(strings.TrimPrefix(base, "https://"), "http://")}
	}
	u.Path = path
	q := u.Query()
	q.Set("return_url", returnURL)
	q.Set("sdk", "1")
	u.RawQuery = q.Encode()
	return u.String()
}

// RemoveQueryParam returns rawURL with the given query parameter removed.
func RemoveQueryParam(rawURL, key string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	q := u.Query()
	q.Del(key)
	u.RawQuery = q.Encode()
	return u.String()
}

// formatInt64 is a small helper so we don't import strconv in every file.
func formatInt64(v int64) string { return strconv.FormatInt(v, 10) }
