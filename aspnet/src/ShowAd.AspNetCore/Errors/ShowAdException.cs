namespace ShowAd.AspNetCore.Errors;

public enum ShowAdErrorCode
{
    Unknown = 0,
    FingerprintFailed = 1001,
    TicketNotFound = 1002,
    TicketExpired = 1003,
    TicketClaimFailed = 1004,
    TokenInvalid = 1005,
    TokenExpired = 1006,
    CreatorMismatch = 1007,
    NetworkError = 1008,
    ConfigError = 1009,
}

public class ShowAdException : Exception
{
    public ShowAdErrorCode Code { get; }
    public IReadOnlyDictionary<string, object?>? Details { get; }

    public ShowAdException(string message, ShowAdErrorCode code = ShowAdErrorCode.Unknown,
        Exception? inner = null, IReadOnlyDictionary<string, object?>? details = null)
        : base(message, inner)
    {
        Code = code;
        Details = details;
    }
}
