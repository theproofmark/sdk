using System.Text.RegularExpressions;

namespace ShowAd.AspNetCore.PathMatching;

/// <summary>Glob-style path matching with <c>*</c> wildcards.</summary>
public static class PathMatcher
{
    public static bool Matches(string path, string pattern)
    {
        var p = Normalize(path);
        var pat = Normalize(pattern);

        if (string.Equals(p, pat, StringComparison.Ordinal))
            return true;

        if (!pat.Contains('*'))
            return false;

        var regex = "^" + Regex.Escape(pat).Replace("\\*", ".*") + "$";
        return Regex.IsMatch(p, regex);
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
