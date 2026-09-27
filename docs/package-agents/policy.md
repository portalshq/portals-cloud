<!-- doc-module: policy-agent-guide -->
# Policy: agent guide
## Load when
Calculating Portals rake or allocating an already-net royalty pool.
## Use
Pass integer cents to `calculateRake` and `calculateRoyaltySplits`; persist and transfer results in a separate payment layer.
## Do not assume
The package validates amounts, varies fees by currency, resolves lineage, or executes payouts.
