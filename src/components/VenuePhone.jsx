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
        <a className="venue-phone-link venue-phone-source" href={contact.sources[0].url}
          target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          title={lang === "vi" ? "Xem số điện thoại trên trang nguồn" : "View phone number on source page"}>
          {lang === "vi" ? "Nguồn" : "Source"}
        </a>
        {detail && contact.checkedAt && <small style={{ flexBasis: "100%" }}>
          {lang === "vi" ? "Đối chiếu nguồn ngày " : "Source checked on "}
          {new Date(contact.checkedAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB")}
        </small>}
      </> : <span>{lang === "vi" ? "Chưa xác minh" : "Not verified"}</span>}
    </div>
  );
}
