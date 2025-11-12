// api/check-env.js
module.exports = async (req, res) => {
  try {
    const hasKey = !!process.env.BITQUERY_API_KEY;
    return res.status(200).json({
      ok: true,
      hasBitqueryEnv: hasKey
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};

