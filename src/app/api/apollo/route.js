import { NextResponse } from "next/server";

export async function POST(req) {
  const body = await req.json();
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Apollo API key not configured." }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
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
    
    if (data.error || !data.people) {
      // Fallback to people/search endpoint
      const res2 = await fetch("https://api.apollo.io/v1/people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          page: body.page || 1,
          per_page: body.per_page || 25,
          person_titles: body.titles || [],
          person_locations: body.locations || [],
          q_organization_keyword_tags: body.industries || [],
          person_seniorities: body.seniorities || [],
        }),
      });
      const data2 = await res2.json();
      return NextResponse.json(data2);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect to Apollo" }, { status: 500 });
  }
}
