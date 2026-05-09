using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.WebUtilities;

namespace ShowAd.AspNetCore.Url;

public static class RedirectUrlBuilder
{
    /// <summary>Build the video-ad redirect URL: <c>{videoAdUrl}/c/{creatorHash}?return_url=...&amp;sdk=1</c>.</summary>
    public static string BuildVideoAdRedirectUrl(string videoAdUrl, string creatorHash, string? returnUrl)
    {
        var baseUrl = videoAdUrl.TrimEnd('/') + "/c/" + System.Uri.EscapeDataString(creatorHash);
        var qs = new Dictionary<string, string?> { ["sdk"] = "1" };
        if (!string.IsNullOrEmpty(returnUrl)) qs["return_url"] = returnUrl;
        return QueryHelpers.AddQueryString(baseUrl, qs);
    }

    public static string GetCurrentUrl(HttpRequest request) => request.GetEncodedUrl();

    public static string RemoveQueryParam(string url, string param)
    {
        var uri = new Uri(url, UriKind.Absolute);
        var qs = QueryHelpers.ParseQuery(uri.Query);
        qs.Remove(param);

        var builder = new UriBuilder(uri) { Query = string.Empty };
        var path = builder.Uri.GetLeftPart(UriPartial.Path);

        var dict = new Dictionary<string, string?>();
        foreach (var kv in qs) dict[kv.Key] = kv.Value.ToString();
        var rebuilt = QueryHelpers.AddQueryString(path, dict);

        if (!string.IsNullOrEmpty(uri.Fragment)) rebuilt += uri.Fragment;
        return rebuilt;
    }
}
