/**
 * Embedded admin: dashboard. Read-only summary of the configured shop.
 * Renders inside Shopify Admin via App Bridge + Polaris.
 */

import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  AppProvider,
  Page,
  Card,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  List,
  Link,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopConfig } from '~/lib/shop-config';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const config = await getShopConfig(session.shop);

  return json({
    shop: session.shop,
    configured: !!(config?.creatorHash && config?.apiKey && config?.redirectSecret),
    creatorHash: config?.creatorHash || null,
    apiBaseUrl: config?.apiBaseUrl || 'https://ad.proofmark.io',
    videoAdUrl: config?.videoAdUrl || 'https://showad.proofmark.io',
    protectedPaths: config?.protectedPaths || [],
    excludedPaths: config?.excludedPaths || [],
    cookieMaxAge: config?.cookieMaxAge || 3600,
  });
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={{}}>
      <Page
        title="ShowAd Content Gate"
        subtitle="Gate premium pages behind ProofMark video ad verification"
        primaryAction={{ content: 'Settings', url: '/app/settings' }}
      >
        <BlockStack gap="500">
          {!data.configured && (
            <Banner tone="warning" title="Not configured yet">
              <Text as="p">
                Add your ProofMark API key, redirect secret, and creator hash on the{' '}
                <Link url="/app/settings">Settings</Link> page to start gating content.
              </Text>
            </Banner>
          )}

          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Status
                </Text>
                <Badge tone={data.configured ? 'success' : 'attention'}>
                  {data.configured ? 'Configured' : 'Setup required'}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Shop: <code>{data.shop}</code>
              </Text>
              {data.creatorHash && (
                <Text as="p" tone="subdued">
                  Creator hash: <code>{data.creatorHash}</code>
                </Text>
              )}
              <Text as="p" tone="subdued">
                Cookie lifetime: {data.cookieMaxAge} seconds
              </Text>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Protected paths
              </Text>
              {data.protectedPaths.length === 0 ? (
                <Text as="p" tone="subdued">
                  None configured. The theme block will gate content on the pages where it is
                  placed.
                </Text>
              ) : (
                <List type="bullet">
                  {data.protectedPaths.map((p) => (
                    <List.Item key={p}>
                      <code>{p}</code>
                    </List.Item>
                  ))}
                </List>
              )}
              {data.excludedPaths.length > 0 && (
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Excluded
                  </Text>
                  <List type="bullet">
                    {data.excludedPaths.map((p) => (
                      <List.Item key={p}>
                        <code>{p}</code>
                      </List.Item>
                    ))}
                  </List>
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Theme block setup
              </Text>
              <List type="number">
                <List.Item>Open the merchant theme editor.</List.Item>
                <List.Item>
                  Add the <strong>ShowAd Gate</strong> app block on any page or section that
                  should be gated.
                </List.Item>
                <List.Item>
                  Configure the locked message, button text, and protected slug in the block
                  settings.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
