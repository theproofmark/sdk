namespace ShowAd.AspNetCore.Http;

public sealed class TicketClaimResult
{
    public string Token { get; init; } = string.Empty;
    public string CreatorHash { get; init; } = string.Empty;
    public string? TicketId { get; init; }
}

public sealed class ValidateTokenResult
{
    public bool Valid { get; init; }
    public string? Message { get; init; }
}

public interface IShowAdHttpClient
{
    Task<TicketClaimResult> ClaimRedirectTicketAsync(string ticketId, CancellationToken ct = default);
    Task<ValidateTokenResult> ValidateTokenAsync(string token, CancellationToken ct = default);
}
