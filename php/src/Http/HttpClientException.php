<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Http;

use RuntimeException;

/**
 * Thrown when an HttpClient implementation cannot complete a transport-level
 * request (DNS, TCP, TLS, timeout). Application-level errors like a 4xx are
 * surfaced via HttpResponse so callers can inspect the status code.
 */
class HttpClientException extends RuntimeException
{
}
