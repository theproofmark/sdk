<?php

namespace ProofMark\ShowAd\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static bool isVerified(\Illuminate\Http\Request $request)
 * @method static array verifyRequest(\Illuminate\Http\Request $request)
 * @method static array claimRedirectTicket(string $ticketId)
 * @method static array validateToken(string $token)
 * @method static bool checkHealth()
 * @method static string buildVideoAdRedirectUrl(string|null $returnUrl = null)
 * @method static string buildResourceRedirectUrl(string $projectHash, string $resourceHash, string|null $returnUrl = null)
 * @method static array getVerificationState(\Illuminate\Http\Request $request)
 * @method static string renderMetaTags()
 * @method static string renderScripts()
 * @method static string getCookieName(string $suffix)
 * @method static mixed getConfig(string $key, mixed $default = null)
 *
 * @see \ProofMark\ShowAd\ShowAdManager
 */
class ShowAd extends Facade
{
    /**
     * Get the registered name of the component.
     *
     * @return string
     */
    protected static function getFacadeAccessor()
    {
        return 'showad';
    }
}
