<?php

declare(strict_types=1);

namespace ProofMark\Verify;

class VerifyResult
{
    public function __construct(
        public readonly bool $success,
        public readonly float $score,
        public readonly array $flags,
        public readonly bool $credit,
        public readonly ?string $challengeTs,
        public readonly ?string $hostname,
        public readonly ?string $action,
        public readonly array $errorCodes
    ) {
    }

    /**
     * Defensively normalize raw API response into VerifyResult.
     */
    public static function fromArray(array $json): self
    {
        $success = ($json['success'] ?? false) === true;
        $score = (float)($json['score'] ?? 0);
        $credit = ($json['credit'] ?? false) === true;

        $flags = $json['flags'] ?? [];
        if (!is_array($flags)) {
            $flags = [];
        }
        $flags = array_values(array_filter($flags, 'is_string'));

        $errorCodes = $json['error-codes'] ?? [];
        if (!is_array($errorCodes)) {
            $errorCodes = [];
        }
        $errorCodes = array_values(array_filter($errorCodes, 'is_string'));

        $challengeTs = isset($json['challenge_ts']) && is_string($json['challenge_ts'])
            ? $json['challenge_ts']
            : null;
        $hostname = isset($json['hostname']) && is_string($json['hostname'])
            ? $json['hostname']
            : null;
        $action = isset($json['action']) && is_string($json['action'])
            ? $json['action']
            : null;

        return new self(
            success: $success,
            score: $score,
            flags: $flags,
            credit: $credit,
            challengeTs: $challengeTs,
            hostname: $hostname,
            action: $action,
            errorCodes: $errorCodes
        );
    }

    /**
     * Convenience: check if result represents a human above a score threshold.
     * Default threshold 0.5 matches recommended practice.
     */
    public function isHuman(float $minScore = 0.5): bool
    {
        return $this->success && $this->score >= $minScore;
    }
}
