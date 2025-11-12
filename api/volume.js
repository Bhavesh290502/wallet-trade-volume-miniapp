// api/volume.js
// Vercel Serverless Function (Node.js runtime with global fetch).
// Expects environment variable BITQUERY_API_KEY set in Vercel.
// Query: /api/volume?address=0x...&chain=eth

module.exports = async (req, res) => {
  try {
    const addrRaw = (req.query.address || '').toString().trim();
    const chain = (req.query.chain || 'eth').toString().toLowerCase();

    if (!addrRaw || !/^0x[0-9a-fA-F]{40}$/.test(addrRaw)) {
      return res.status(400).json({ error: 'Invalid or missing address. Use ?address=0x...' });
    }
    const address = addrRaw.toLowerCase();

    const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;
    if (!BITQUERY_API_KEY) {
      return res.status(500).json({ error: 'Missing BITQUERY_API_KEY environment variable on server' });
    }

    // Map simple chain to Bitquery network name
    const NETWORK_MAP = {
      eth: 'ethereum',
      polygon: 'polygon',
      bsc: 'bsc',
      optimism: 'optimism',
      arbitrum: 'arbitrum',
      base: 'base'
    };
    const network = NETWORK_MAP[chain] || 'ethereum';

    // GraphQL query: fetch dexTrades where address is buyer or seller or tx.from
    // We request tradeAmount(in: USD) for each trade; we'll sum it server-side.
    const query = `
      query ($addr: String!) {
        ${network} {
          dexTrades(
            any: [
              { buyer: { is: $addr } },
              { seller: { is: $addr } },
              { transaction: { from: { is: $addr } } }
            ],
            options: {limit: 10000}
          ) {
            transaction {
              hash
            }
            time {
              unix
            }
            buyAmount
            sellAmount
            tradeAmount(in: USD)
          }
        }
      }
    `;

    const variables = { addr: address };

    const resp = await fetch('https://graphql.bitquery.io/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': BITQUERY_API_KEY
      },
      body: JSON.stringify({ query, variables })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(()=>null);
      return res.status(502).json({ error: 'Bitquery responded with error', status: resp.status, body: text });
    }

    const json = await resp.json();
    if (json.errors) {
      return res.status(502).json({ error: 'Bitquery GraphQL errors', details: json.errors });
    }

    const trades = (json.data && json.data[network] && json.data[network].dexTrades) || [];

    let totalUsd = 0;
    const breakdown = [];

    for (const t of trades) {
      let usd = 0;
      if (t['tradeAmount(in: USD)'] !== undefined && t['tradeAmount(in: USD)'] !== null) {
        // some GraphQL clients return aliased fields as raw keys; try both ways
        usd = Number(t['tradeAmount(in: USD)']) || 0;
      } else if (t.tradeAmount !== undefined && t.tradeAmount !== null) {
        usd = Number(t.tradeAmount) || 0;
      } else if (t['tradeAmount(in: USD)'] === undefined) {
        // fallback: approximate from buyAmount * 1 (not perfect, but attempt)
        const buy = Number(t.buyAmount || 0);
        const sell = Number(t.sellAmount || 0);
        usd = Math.max(buy, sell) || 0;
      }
      totalUsd += usd;
      breakdown.push({ hash: t.transaction?.hash || null, time: t.time?.unix || null, usd });
    }

    return res.status(200).json({ volumeUsd: totalUsd, count: trades.length, breakdown });
  } catch (err) {
    console.error('api/volume error', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
};
