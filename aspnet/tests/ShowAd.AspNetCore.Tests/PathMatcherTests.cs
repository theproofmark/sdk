using ShowAd.AspNetCore.PathMatching;
using Xunit;

namespace ShowAd.AspNetCore.Tests;

public class PathMatcherTests
{
    [Theory]
    [InlineData("/premium", "/premium", true)]
    [InlineData("/premium/article-1", "/premium/*", true)]
    [InlineData("/articles/x", "/premium/*", false)]
    [InlineData("premium", "premium", true)]
    [InlineData("/api/health", "/api/*", true)]
    [InlineData("/api", "/api/*", false)]
    [InlineData("/exact-path", "/exact-path", true)]
    public void Matches_works(string path, string pattern, bool expected)
    {
        Assert.Equal(expected, PathMatcher.Matches(path, pattern));
    }

    [Fact]
    public void MatchesAny_returns_true_when_any_pattern_matches()
    {
        var patterns = new[] { "/api/*", "/premium/*" };
        Assert.True(PathMatcher.MatchesAny("/premium/foo", patterns));
        Assert.True(PathMatcher.MatchesAny("/api/health", patterns));
        Assert.False(PathMatcher.MatchesAny("/about", patterns));
    }
}
