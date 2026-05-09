<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\Config;
use ProofMark\ShowAd\ShowAdException;

final class ConfigTest extends TestCase
{
    public function testRequiresCreatorHash(): void
    {
        $this->expectException(ShowAdException::class);
        $this->expectExceptionCode(ShowAdException::CONFIG_ERROR);
        new Config([]);
    }

    public function testDotNotationAccess(): void
    {
        $config = new Config([
            'creator_hash' => 'c',
            'cookie' => ['prefix' => 'pm', 'max_age' => 600],
        ]);

        self::assertSame('pm', $config->get('cookie.prefix'));
        self::assertSame(600, $config->get('cookie.max_age'));
        self::assertSame('default', $config->get('missing.key', 'default'));
    }

    public function testWithReturnsNewInstance(): void
    {
        $a = new Config(['creator_hash' => 'c']);
        $b = $a->with(['debug' => true]);

        self::assertFalse($a->debug());
        self::assertTrue($b->debug());
    }

    public function testApiBaseUrlIsTrimmed(): void
    {
        $config = new Config(['creator_hash' => 'c', 'api_base_url' => 'https://ad.example.com/']);
        self::assertSame('https://ad.example.com', $config->apiBaseUrl());
    }
}
