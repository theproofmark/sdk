<?php

/**
 * ProofMark Verify — Laravel Controller Example
 *
 * ProofMark Verify is a CAPTCHA replacement that pays you instead of charging you.
 * This example shows how to verify tokens server-side in a Laravel application.
 *
 * ----------------------------------------------------------------------------
 * Plain PHP Example (framework-free):
 * ----------------------------------------------------------------------------
 *
 * <?php
 * require 'vendor/autoload.php';
 *
 * use ProofMark\Verify\ProofMarkVerify;
 *
 * $token = $_POST['pm-verify-response'] ?? '';
 * $pmv = new ProofMarkVerify($_ENV['PMV_SECRET_KEY']);
 *
 * try {
 *     $result = $pmv->verify($token, $_SERVER['REMOTE_ADDR']);
 *
 *     if ($result->isHuman()) {
 *         // Proceed with signup/login
 *         echo "Welcome!";
 *     } else {
 *         http_response_code(400);
 *         echo "Verification failed";
 *     }
 * } catch (\ProofMark\Verify\ProofMarkVerifyException $e) {
 *     error_log("ProofMark Verify error: {$e->getMessage()}");
 *     http_response_code(500);
 *     echo "Service unavailable";
 * }
 *
 * ----------------------------------------------------------------------------
 * Laravel Example:
 * ----------------------------------------------------------------------------
 */

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use ProofMark\Verify\ProofMarkVerify;
use ProofMark\Verify\ProofMarkVerifyException;

class SignupController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validate form input (including ProofMark token)
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
            'pm-verify-response' => 'required|string',
        ]);

        if ($validator->fails()) {
            return back()
                ->withErrors($validator)
                ->withInput();
        }

        // 2. Verify the ProofMark token server-side
        $token = $request->input('pm-verify-response');
        $pmv = new ProofMarkVerify(env('PMV_SECRET_KEY'));

        try {
            $result = $pmv->verify($token, $request->ip());

            // 3. Gate on score threshold (0.5 for signups)
            if (!$result->isHuman(0.5)) {
                return back()
                    ->withErrors(['pm-verify-response' => 'Verification failed. Please try again.'])
                    ->withInput();
            }

            // Optional: Log risk flags for audit
            if (!empty($result->flags)) {
                \Log::info('ProofMark flags for signup', [
                    'email' => $request->email,
                    'flags' => $result->flags,
                    'score' => $result->score
                ]);
            }

            // 4. Proceed with signup
            $user = \App\Models\User::create([
                'email' => $request->email,
                'password' => bcrypt($request->password),
            ]);

            auth()->login($user);

            return redirect()->route('dashboard')
                ->with('success', 'Welcome to the platform!');

        } catch (ProofMarkVerifyException $e) {
            // Network/API error — fail open or closed depending on your risk tolerance
            \Log::error('ProofMark Verify API error', [
                'errorCode' => $e->errorCode,
                'message' => $e->getMessage()
            ]);

            // Fail closed (recommended for signups):
            return back()
                ->withErrors(['pm-verify-response' => 'Verification service unavailable. Please try again.'])
                ->withInput();

            // To fail open instead (allow signup on API errors):
            // return $this->proceedWithSignup($request);
        }
    }
}

/**
 * ----------------------------------------------------------------------------
 * Blade Template Example (resources/views/auth/signup.blade.php):
 * ----------------------------------------------------------------------------
 *
 * <form method="POST" action="{{ route('signup.store') }}">
 *     @csrf
 *     <input type="email" name="email" required>
 *     <input type="password" name="password" required>
 *
 *     <!-- ProofMark Verify Widget -->
 *     <div class="pm-verify" data-sitekey="{{ env('PMV_SITE_KEY') }}"></div>
 *     @error('pm-verify-response')
 *         <span class="error">{{ $message }}</span>
 *     @enderror
 *
 *     <button type="submit">Sign up</button>
 * </form>
 *
 * <script src="https://verify.proofmark.com/api.js" async defer></script>
 *
 * ----------------------------------------------------------------------------
 * Environment Variables (.env):
 * ----------------------------------------------------------------------------
 *
 * PMV_SITE_KEY=pmv_live_xxxxxxxxxxxxxxxx
 * PMV_SECRET_KEY=pmvs_live_xxxxxxxxxxxxxxxx
 *
 * For local dev/testing, use test keys that skip real verification:
 * PMV_SITE_KEY=pmv_test_always_pass
 * PMV_SECRET_KEY=pmvs_test_always_pass
 *
 * ----------------------------------------------------------------------------
 * Recommended Score Thresholds:
 * ----------------------------------------------------------------------------
 *
 * Newsletter signup:       0.3
 * Free trial signup:       0.5
 * Paid signup w/ card:     0.6
 * Forum post:              0.4
 * Password reset:          0.7
 * Login (suspicious):      0.7
 */
