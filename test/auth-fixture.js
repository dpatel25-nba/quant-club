// Synthetic gate for JSCore domain tests; actual auth is tested with Node in check_auth.mjs.
async function requireToolsAuth(req,res,allowQuery) {
 res.setHeader('Cache-Control','private, no-store');
 var supplied=(req.headers||{})['x-tools-password'] || (allowQuery && (req.query||{}).k);
 if (supplied && supplied===process.env.TOOLS_PASSWORD) return true;
 res.status(401).json({error:'Sign in to Research Tools to continue.'});return false;
}
