using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace ShowAd.AspNetCore.PathMatching;

/// <summary>
/// Glob-style path matching with <c>*</c> wildcards.
/// Compiled regexes are cached (bounded to avoid unbounded growth under
/// attacker-supplied pattern enumeration).
/// </summary>
public static class PathMatcher
{
    private const int CacheMax = 1024;
    private static readonly ConcurrentDictionary<string, Regex> RegexCache = new();

    public static bool Matches(string path, string pattern)
    {
        var p = Normalize(path);
        var pat = Normalize(pattern);

        if (string.Equals(p, pat, StringComparison.Ordinal))
            return true;

        if (!pat.Contains('*'))
            return false;

        var regex = RegexCache.GetOrAdd(pat, key =>
        {
            // Bound the cache to avoid unbounded growth if patterns vary.
            if (RegexCache.Count >= CacheMax)
            {
                RegexCache.Clear();
            }
            var pattern = "^" + Regex.Escape(key).Replace("\\*", ".*") + "$";
            return new Regex(pattern, RegexOptions.Compiled | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50));
        });

        return regex.IsMatch(p);
    }

    public static bool MatchesAny(string path, IEnumerable<string> patterns)
    {
        foreach (var pattern in patterns)
        {
            if (Matches(path, pattern)) return true;
        }
        return false;
    }

    private static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value)) return "/";
        return value.StartsWith('/') ? value : "/" + value;
    }
}
