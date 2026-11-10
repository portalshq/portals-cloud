# @portalshq/channel-registry

## 0.2.3

### Patch Changes

- Republish of 0.2.2: the npm staged publish never became visible on the registry.

## 0.2.2

### Patch Changes

- f75dca8: Add optional `channels.<id>.guest."initial-credits"` schema field so apps can configure the starting credit balance granted to guest actors.

## 0.2.1

### Patch Changes

- Accept the optional channel `signup.bonus-credits` block so registries carrying a welcome-bonus policy still validate and survive `openChannelRegistry` refreshes.
