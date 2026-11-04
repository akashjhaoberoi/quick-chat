import { business, businessContactConfigured } from "@/lib/business";

/** Support contact block for policy pages. Values come from the environment (see .env.example). */
export function ContactDetails() {
  return (
    <>
      {!businessContactConfigured ? (
        <p className="rounded-2xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm !text-ink">
          Support contact details have not been configured yet. Site owner: set NEXT_PUBLIC_SUPPORT_EMAIL, NEXT_PUBLIC_SUPPORT_PHONE and
          NEXT_PUBLIC_BUSINESS_ADDRESS.
        </p>
      ) : null}
      <ul>
        <li>
          <strong>Business:</strong> {business.name}
        </li>
        {business.email ? (
          <li>
            <strong>Email:</strong>{" "}
            <a href={`mailto:${business.email}`} className="font-semibold text-brand">
              {business.email}
            </a>
          </li>
        ) : null}
        {business.phone ? (
          <li>
            <strong>Phone:</strong>{" "}
            <a href={`tel:${business.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand">
              {business.phone}
            </a>
          </li>
        ) : null}
        {business.address ? (
          <li>
            <strong>Address:</strong> {business.address}
          </li>
        ) : null}
        {business.hours ? (
          <li>
            <strong>Support hours:</strong> {business.hours}
          </li>
        ) : null}
      </ul>
    </>
  );
}
