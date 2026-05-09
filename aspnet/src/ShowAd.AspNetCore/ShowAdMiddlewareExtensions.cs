using Microsoft.AspNetCore.Builder;

namespace ShowAd.AspNetCore;

public static class ShowAdMiddlewareExtensions
{
    /// <summary>Add ShowAd verification middleware to the pipeline.</summary>
    public static IApplicationBuilder UseShowAd(this IApplicationBuilder app)
        => app.UseMiddleware<ShowAdMiddleware>();
}
