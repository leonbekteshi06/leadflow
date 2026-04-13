import { NextResponse } from "next/server";
 
export async function POST(req) {
  const body = await req.json();
  const apiKey = process.env.APOLLO_API_KEY;
 
  if (!apiKey) {
    return NextResponse.json({ error: "Apollo API key not configured. Add APOLLO_API_KEY to your Vercel environment variables. Get a free key at app.apollo.io" }, { status: 500 });
  }
 
  try {
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        page: body.page || 1,
        per_page: body.per_page || 25,
        person_titles: body.titles || [],
        person_locations: body.locations || [],
        q_organization_keyword_tags: body.industries || [],
        person_seniorities: body.seniorities || [],
        organization_num_employees_ranges: body.company_sizes || [],
        q_keywords: body.keywords || "",
      }),
    });
 
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch from Apollo" }, { status: 500 });
  }
}
 
