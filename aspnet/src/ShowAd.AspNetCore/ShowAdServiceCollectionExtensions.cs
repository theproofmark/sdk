using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using ShowAd.AspNetCore.AccessPolicy;
using ShowAd.AspNetCore.Http;

namespace ShowAd.AspNetCore;

public static class ShowAdServiceCollectionExtensions
{
    /// <summary>Register ShowAd services.</summary>
    public static IServiceCollection AddShowAd(this IServiceCollection services, Action<ShowAdOptions> configure)
    {
        services.Configure(configure);
        services.PostConfigure<ShowAdOptions>(opts => opts.Validate());

        services.TryAddSingleton<AccessPolicyEvaluator>();

        services.AddHttpClient<IShowAdHttpClient, ShowAdHttpClient>(ShowAdHttpClient.ClientName, (sp, http) =>
        {
            var opts = sp.GetRequiredService<IOptions<ShowAdOptions>>().Value;
            http.Timeout = opts.HttpTimeout;
        });

        return services;
    }
}
