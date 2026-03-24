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

  const baseUrl = process.env.BASE_URL || "https://proposallock.vercel.app";

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
      throw new Error(`Email notification failed: ${err}`);
    }
    console.log(`Payment notification sent to ${params.freelancerEmail}`);
  } catch (e) {
    console.error("Email notification error:", e);
    throw e;
  }
}

export async function notifyClientReminder(params: {
  clientEmail: string;
  title: string;
  clientName: string;
  proposalId: string;
  paymentUrl: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping reminder email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [params.clientEmail],
        subject: `Reminder: "${params.title}" is waiting for your payment`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <span style="color: white; font-size: 16px; font-weight: bold;">PL</span>
              </div>
            </div>
            <h2 style="color: #1a1714; font-size: 20px; margin-bottom: 8px;">Your proposal is ready</h2>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Hi ${escapeHtml(params.clientName)}, just a quick note that your proposal for
              <strong>${escapeHtml(params.title)}</strong> is ready and waiting for your review.
            </p>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Files unlock automatically the moment payment goes through. No back and forth needed.
            </p>
            <a href="${params.paymentUrl}" style="display: block; text-align: center; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; font-weight: 600; padding: 12px 24px; border-radius: 12px; text-decoration: none; margin-top: 24px;">
              Review and Pay
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
      throw new Error(`Reminder email failed: ${err}`);
    }
    console.log(`[notify] Reminder sent to ${params.clientEmail}`);
  } catch (e) {
    console.error("[notify] Reminder error:", e);
    throw e;
  }
}

export async function sendTestimonialRequestEmail(params: {
  freelancerEmail: string;
  title: string;
  paidAt: string;
  proposalId: string;
}): Promise<void> {
  if (!RESEND_API_KEY) return;

  const baseUrl = process.env.BASE_URL || "https://proposallock.vercel.app";
  const paidDate = new Date(params.paidAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formUrl = `${baseUrl}/testimonial?pid=${params.proposalId}`;

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
        subject: `How did "${escapeHtml(params.title)}" go?`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <span style="color: white; font-size: 16px; font-weight: bold;">PL</span>
              </div>
            </div>
            <h2 style="color: #1a1714; font-size: 20px; margin-bottom: 8px;">How did it go?</h2>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Your client paid for <strong>${escapeHtml(params.title)}</strong> on ${paidDate}. The files unlocked automatically.
            </p>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              One quick question: how did ProposalLock work for you?
            </p>
            <a href="${formUrl}" style="display: block; text-align: center; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; font-weight: 600; padding: 12px 24px; border-radius: 12px; text-decoration: none; margin-bottom: 20px;">
              Share your experience -- 60 seconds
            </a>
            <p style="color: #a89272; font-size: 12px; line-height: 1.6; text-align: center; margin-bottom: 0;">
              It helps other freelancers find ProposalLock.
            </p>
            <p style="color: #a89272; font-size: 12px; text-align: center; margin-top: 24px;">
              &copy; 2026 ProposalLock
            </p>
          </div>
        `,
      }),
    });

    if (res.ok) {
      console.log(`[notify] Testimonial request sent to ${params.freelancerEmail}`);
    }
  } catch (e) {
    console.error("[notify] Testimonial request error:", e);
  }
}

export async function notifyClientProposal(params: {
  clientEmail: string;
  clientName: string;
  title: string;
  proposalId: string;
  priceCents: number;
  proposalUrl: string;
}): Promise<void> {
  if (!RESEND_API_KEY) return;

  const priceFormatted = (params.priceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [params.clientEmail],
        subject: `Your proposal is ready: ${escapeHtml(params.title)}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <span style="color: white; font-size: 16px; font-weight: bold;">PL</span>
              </div>
            </div>
            <h2 style="color: #1a1714; font-size: 20px; margin-bottom: 8px;">Your proposal is ready</h2>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Hi ${escapeHtml(params.clientName)}, your proposal for <strong>${escapeHtml(params.title)}</strong> is ready to review.
            </p>
            <div style="background: #fdfcfb; border: 1px solid #f3ece3; border-radius: 12px; padding: 16px; margin-bottom: 20px; text-align: center;">
              <p style="color: #6b5a44; font-size: 13px; margin: 0 0 8px;">Amount due</p>
              <p style="color: #1a1714; font-size: 28px; font-weight: 700; margin: 0;">${priceFormatted}</p>
            </div>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              Files unlock automatically the moment payment clears. No account needed.
            </p>
            <a href="${params.proposalUrl}" style="display: block; text-align: center; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; font-weight: 600; padding: 14px 24px; border-radius: 12px; text-decoration: none; margin-top: 24px; font-size: 15px;">
              Review and Pay ${priceFormatted}
            </a>
            <p style="color: #a89272; font-size: 12px; text-align: center; margin-top: 16px;">
              Secure payment via LemonSqueezy. No account required.
            </p>
            <p style="color: #a89272; font-size: 12px; text-align: center; margin-top: 24px;">
              &copy; 2026 ProposalLock
            </p>
          </div>
        `,
      }),
    });
    if (res.ok) {
      console.log(`[notify] Proposal email sent to ${params.clientEmail}`);
    } else {
      const err = await res.text();
      console.error("[notify] Client proposal email failed:", err);
    }
  } catch (e) {
    console.error("[notify] Client proposal email error:", e);
  }
}

export async function notifyFreelancerViewed(params: {
  freelancerEmail: string;
  title: string;
  clientName: string;
  proposalId: string;
}): Promise<void> {
  if (!RESEND_API_KEY) return;

  const baseUrl = process.env.BASE_URL || "https://proposallock.vercel.app";

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
        subject: `Your client just opened your proposal: "${params.title}"`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <span style="color: white; font-size: 16px; font-weight: bold;">PL</span>
              </div>
            </div>
            <h2 style="color: #1a1714; font-size: 20px; margin-bottom: 8px;">Your client opened your proposal</h2>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              <strong>${escapeHtml(params.clientName)}</strong> just viewed your proposal:
            </p>
            <div style="background: #fdfcfb; border: 1px solid #f3ece3; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #1a1714; font-weight: 600; margin: 0;">${escapeHtml(params.title)}</p>
            </div>
            <p style="color: #6b5a44; font-size: 14px; line-height: 1.6;">
              They haven't paid yet. If they have questions, now is a great time to follow up.
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
    if (res.ok) {
      console.log(`[notify] View notification sent to ${params.freelancerEmail}`);
    }
  } catch (e) {
    console.error("[notify] View notification error:", e);
  }
}
