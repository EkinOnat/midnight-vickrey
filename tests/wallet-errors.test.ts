import { describe, expect, it } from 'vitest';

import {
  errorMessage,
  hintWalletUsage,
  isClosedWalletChannel,
} from '../src/utils/contract';

describe('wallet connection errors', () => {
  it('recognizes a Lace remote API that was shut down', () => {
    const error = new Error(
      "Remote API with channel 'midnight-authenticator' was shutdown: Object can no longer be used.",
    );

    expect(isClosedWalletChannel(error)).toBe(true);
    expect(errorMessage(error)).toContain('Reload the page');
  });

  it('turns the connector disconnected code into recovery instructions', () => {
    const error = Object.assign(new Error('Connection lost'), {
      type: 'DAppConnectorAPIError',
      code: 'Disconnected',
      reason: 'The extension channel closed.',
    });

    expect(errorMessage(error)).toContain('unlock Lace on Preprod');
  });

  it('continues when a wallet omits the optional usage-hint method', async () => {
    await expect(hintWalletUsage({})).resolves.toBeUndefined();
  });

  it('sends usage hints when the wallet implements them', async () => {
    let methods: readonly string[] = [];

    await hintWalletUsage({
      hintUsage(requested: readonly string[]) {
        methods = requested;
        return Promise.resolve();
      },
    });

    expect(methods).toContain('getShieldedAddresses');
    expect(methods).toContain('submitTransaction');
  });
});
