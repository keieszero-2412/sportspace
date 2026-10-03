import React from "react";
import { Phone } from "lucide-react";
import { getVenuePhone } from "../services/venuePhone";

export default function VenuePhone({ venue, lang = "vi", detail = false }) {
  const contact = getVenuePhone(venue);
  return (
    <div className="venue-phone" data-phone-status={contact ? "sourced" : "unverified"}>
      <Phone size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>Hotline: </span>
      {contact ? <>
        <a className="venue-phone-link" href={`tel:${contact.number}`} onClick={e => e.stopPropagation()}>
          {contact.number}
        </a>

      </> : <span>{lang === "vi" ? "Chưa xác minh" : "Not verified"}</span>}
    </div>
  );
}
