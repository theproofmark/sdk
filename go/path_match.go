package showad

import (
	"regexp"
	"strings"
	"sync"
)

// MatchPath reports whether pathname matches a glob pattern. Supported wildcards: '*'.
func MatchPath(pathname, pattern string) bool {
	if pattern == pathname {
		return true
	}
	if !strings.Contains(pattern, "*") {
		return false
	}
	return globRegex(pattern).MatchString(pathname)
}

// MatchAny returns true if pathname matches any of the patterns.
func MatchAny(pathname string, patterns []string) bool {
	for _, p := range patterns {
		if MatchPath(pathname, p) {
			return true
		}
	}
	return false
}

var (
	globCache = struct {
		sync.RWMutex
		m map[string]*regexp.Regexp
	}{m: make(map[string]*regexp.Regexp)}
)

func globRegex(pattern string) *regexp.Regexp {
	globCache.RLock()
	if re, ok := globCache.m[pattern]; ok {
		globCache.RUnlock()
		return re
	}
	globCache.RUnlock()

	var b strings.Builder
	b.WriteByte('^')
	for _, r := range pattern {
		switch r {
		case '*':
			b.WriteString(".*")
		case '.', '+', '(', ')', '[', ']', '{', '}', '?', '|', '^', '$', '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('$')

	re, err := regexp.Compile(b.String())
	if err != nil {
		re = regexp.MustCompile(`^$`)
	}

	globCache.Lock()
	globCache.m[pattern] = re
	globCache.Unlock()
	return re
}
