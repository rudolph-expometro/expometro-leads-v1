// Vercel Serverless Function — renvoie le pays du visiteur (en-tête géo Vercel)
// Utilisé par florence.html pour afficher les prix dans la bonne devise.
export default function handler(req, res) {
  const country = req.headers['x-vercel-ip-country'] || '';
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ country });
}
