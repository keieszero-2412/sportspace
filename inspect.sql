select 'Facilities' as table_name, count(*)::int as total, count(phone)::int as phone_rows, count(image)::int as image_rows from public."Facilities";
