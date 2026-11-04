/**
 * Public business/contact details for the policy pages (Razorpay website
 * verification needs genuine ones). They are read from the environment so
 * nothing is invented in code; unset values render as "not configured".
 */
export const business = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || "Akarika Technologies",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || null,
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim() || null,
  hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || null,
};

export const businessContactConfigured = Boolean(business.email && business.address);
