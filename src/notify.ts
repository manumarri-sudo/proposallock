const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "ProposalLock <noreply@proposallock.io>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function notifyFreelancerPaid(params: {
  freelancerEmail: string;
  title: string;
  clientName: string;
  priceCents: number;
  proposalId: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping email notification");
    return;
  }

  const priceFormatted = (params.priceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const baseUrl = process.env.BASE_URL || "https://proposallock.onrender.com";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [params.freelancerEmail],
        subject: `Payment received: ${priceFormatted} for "${params.title}"`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <span style="color: white; font-size: 16px; font-weight: bold;">PL</span>
              </div>
            </div>
            <h2 style="color: #1a1714; font-size: 20px; margin-bottom: 8px;">Payment received!</h2>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Your client <strong>${escapeHtml(params.clientName)}</strong> just paid <strong>${priceFormatted}</strong> for:
            </p>
            <div style="background: #fdfcfb; border: 1px solid #f3ece3; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #1a1714; font-weight: 600; margin: 0;">${escapeHtml(params.title)}</p>
            </div>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6;">
              Files have been automatically unlocked for your client.
            </p>
            <a href="${baseUrl}/dashboard" style="display: block; text-align: center; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; font-weight: 600; padding: 12px 24px; border-radius: 12px; text-decoration: none; margin-top: 24px;">
              View Dashboard
            </a>
            <p style="color: #a89272; font-size: 12px; text-align: center; margin-top: 24px;">
              &copy; 2026 ProposalLock
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend email failed:", err);
    } else {
      console.log(`Payment notification sent to ${params.freelancerEmail}`);
    }
  } catch (e) {
    console.error("Email notification error:", e);
  }
}
