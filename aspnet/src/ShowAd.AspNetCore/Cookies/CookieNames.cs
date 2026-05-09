namespace ShowAd.AspNetCore.Cookies;

public static class CookieNames
{
    public const string Fingerprint = "fingerprint";
    public const string Token = "token";
    public const string Creator = "creator";
    public const string Ticket = "ticket";
    public const string Verified = "verified";
    public const string Expires = "expires";

    public static string Build(string prefix, string suffix) => $"{prefix}_{suffix}";
}
