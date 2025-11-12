// api/volume.js
module.exports = async (req, res) => {
  try {
    const address = (req.query.address || '').trim().toLowerCase();
    const chain = (req.query.chain || 'eth').toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid or missing address' });
    }

    const chainMap = {
      eth: 1,
      ethereum: 1,
      polygon: 137,
      matic: 137,
      bsc: 56,
      base: 8453,
      arbitrum: 42161,
      optimism: 10,
    };

    const chainId = chainMap[chain] || 1;
    const apiKey = process.env.COVALENT_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing COVALENT_API_KEY environment variable' });
    }

    const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v3/?quote-currency=USD&no-logs=true&key=${apiKey}`;

    const resp = await fetch(url);
    const text = await resp.text();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Covalent API error', body: text });
    }

    const json = JSON.parse(text);
    if (!json?.data?.items) {
      return res.status(200).json({ volumeUsd: 0, count: 0, breakdown: [] });
    }

    let totalUsd = 0;
    let count = 0;
    for (const tx of json.data.items) {
      const quote = tx.value_quote || 0;
      if (quote > 0) {
        totalUsd += quote;
        count++;
      }
    }

    res.status(200).json({ volumeUsd: totalUsd, count });
  } catch (err) {
    console.error('Error in /api/volume:', err);
    res.status(500).json({ error: 'Internal server error', details: String(err) });
  }
};
