/**
 * Embedded admin: settings form. Stores per-shop ProofMark credentials and
 * gating configuration. API keys and redirect secrets are write-only — once
 * set we never echo them back to the form (we only show whether they exist).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form, useActionData, useNavigation } from '@remix-run/react';
import {
  AppProvider,
  Page,
  Card,
  BlockStack,
  Banner,
  TextField,
  FormLayout,
  Button,
  InlineStack,
  Text,
} from '@shopify/polaris';
import { useState } from 'react';
import { authenticate } from '~/shopify.server';
import { getShopConfig, upsertShopConfig } from '~/lib/shop-config';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const config = await getShopConfig(session.shop);

  return json({
    shop: session.shop,
    creatorHash: config?.creatorHash ?? '',
    hasApiKey: !!config?.apiKey,
    hasRedirectSecret: !!config?.redirectSecret,
    apiBaseUrl: config?.apiBaseUrl ?? 'https://ad.proofmark.io',
    videoAdUrl: config?.videoAdUrl ?? 'https://showad.proofmark.io',
    protectedPaths: (config?.protectedPaths ?? []).join('\n'),
    excludedPaths: (config?.excludedPaths ?? []).join('\n'),
    cookieMaxAge: config?.cookieMaxAge ?? 3600,
    accessPolicyJson: config?.accessPolicyJson ?? '',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const creatorHash = String(form.get('creatorHash') || '').trim();
  const apiKey = String(form.get('apiKey') || '').trim();
  const redirectSecret = String(form.get('redirectSecret') || '').trim();
  const apiBaseUrl = String(form.get('apiBaseUrl') || 'https://ad.proofmark.io').trim();
  const videoAdUrl = String(form.get('videoAdUrl') || 'https://showad.proofmark.io').trim();
  const protectedPaths = String(form.get('protectedPaths') || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedPaths = String(form.get('excludedPaths') || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cookieMaxAge = Math.max(60, Math.min(86400, Number(form.get('cookieMaxAge') || 3600)));
  const accessPolicyJsonRaw = String(form.get('accessPolicyJson') || '').trim();

  const errors: Record<string, string> = {};
  if (!creatorHash) errors.creatorHash = 'Creator hash is required';

  // Preserve existing secrets when the field is left blank.
  const existing = await getShopConfig(session.shop);
  const finalApiKey = apiKey || existing?.apiKey || '';
  const finalRedirectSecret = redirectSecret || existing?.redirectSecret || '';
  if (!finalApiKey) errors.apiKey = 'API key is required';
  if (!finalRedirectSecret) errors.redirectSecret = 'Redirect secret is required';

  if (accessPolicyJsonRaw) {
    try {
      JSON.parse(accessPolicyJsonRaw);
    } catch {
      errors.accessPolicyJson = 'Must be valid JSON';
    }
  }

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, { status: 400 });
  }

  await upsertShopConfig({
    shop: session.shop,
    creatorHash,
    apiKey: finalApiKey,
    redirectSecret: finalRedirectSecret,
    apiBaseUrl,
    videoAdUrl,
    protectedPaths,
    excludedPaths,
    cookieMaxAge,
    accessPolicyJson: accessPolicyJsonRaw || null,
  });

  return redirect('/app/dashboard');
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  const [creatorHash, setCreatorHash] = useState(data.creatorHash);
  const [apiKey, setApiKey] = useState('');
  const [redirectSecret, setRedirectSecret] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(data.apiBaseUrl);
  const [videoAdUrl, setVideoAdUrl] = useState(data.videoAdUrl);
  const [protectedPaths, setProtectedPaths] = useState(data.protectedPaths);
  const [excludedPaths, setExcludedPaths] = useState(data.excludedPaths);
  const [cookieMaxAge, setCookieMaxAge] = useState(String(data.cookieMaxAge));
  const [accessPolicyJson, setAccessPolicyJson] = useState(data.accessPolicyJson);

  const errors = (actionData && 'errors' in actionData ? actionData.errors : {}) as Record<
    string,
    string
  >;

  return (
    <AppProvider i18n={{}}>
      <Page
        title="ShowAd Settings"
        backAction={{ content: 'Dashboard', url: '/app/dashboard' }}
      >
        <BlockStack gap="500">
          {Object.keys(errors).length > 0 && (
            <Banner tone="critical" title="Please fix the errors below" />
          )}

          <Form method="post" replace>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    ProofMark credentials
                  </Text>
                  <FormLayout>
                    <TextField
                      label="Creator hash"
                      name="creatorHash"
                      value={creatorHash}
                      onChange={setCreatorHash}
                      autoComplete="off"
                      requiredIndicator
                      error={errors.creatorHash}
                    />
                    <TextField
                      label="API key"
                      name="apiKey"
                      value={apiKey}
                      onChange={setApiKey}
                      type="password"
                      autoComplete="off"
                      requiredIndicator={!data.hasApiKey}
                      helpText={
                        data.hasApiKey ? 'Leave blank to keep the existing key' : undefined
                      }
                      error={errors.apiKey}
                    />
                    <TextField
                      label="Redirect secret"
                      name="redirectSecret"
                      value={redirectSecret}
                      onChange={setRedirectSecret}
                      type="password"
                      autoComplete="off"
                      requiredIndicator={!data.hasRedirectSecret}
                      helpText={
                        data.hasRedirectSecret
                          ? 'Leave blank to keep the existing secret'
                          : undefined
                      }
                      error={errors.redirectSecret}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Endpoints
                  </Text>
                  <FormLayout>
                    <TextField
                      label="API base URL"
                      name="apiBaseUrl"
                      value={apiBaseUrl}
                      onChange={setApiBaseUrl}
                      autoComplete="off"
                    />
                    <TextField
                      label="Video ad URL"
                      name="videoAdUrl"
                      value={videoAdUrl}
                      onChange={setVideoAdUrl}
                      autoComplete="off"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Gating
                  </Text>
                  <FormLayout>
                    <TextField
                      label="Protected paths"
                      name="protectedPaths"
                      value={protectedPaths}
                      onChange={setProtectedPaths}
                      multiline={4}
                      autoComplete="off"
                      helpText="One pattern per line. Wildcards: /pages/premium/*"
                    />
                    <TextField
                      label="Excluded paths"
                      name="excludedPaths"
                      value={excludedPaths}
                      onChange={setExcludedPaths}
                      multiline={3}
                      autoComplete="off"
                    />
                    <TextField
                      label="Cookie max age (seconds)"
                      name="cookieMaxAge"
                      value={cookieMaxAge}
                      onChange={setCookieMaxAge}
                      type="number"
                      min={60}
                      max={86400}
                      autoComplete="off"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Access policy (optional, JSON)
                  </Text>
                  <Text as="p" tone="subdued">
                    Allow verified crawlers, CIDR allowlists, etc. Mirrors the Next.js SDK
                    access-policy schema.
                  </Text>
                  <FormLayout>
                    <TextField
                      label="JSON"
                      name="accessPolicyJson"
                      value={accessPolicyJson}
                      onChange={setAccessPolicyJson}
                      multiline={6}
                      autoComplete="off"
                      error={errors.accessPolicyJson}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" loading={submitting}>
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
