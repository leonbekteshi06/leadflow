-- Run this in your Supabase SQL Editor (supabase.com > your project > SQL Editor)

-- Contacts table
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  ig TEXT DEFAULT '',
  email TEXT DEFAULT '',
  youtube TEXT DEFAULT '',
  website TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  stage TEXT DEFAULT 'new',
  current_step INTEGER DEFAULT 0,
  nurture_step INTEGER DEFAULT 0,
  created_at DATE DEFAULT CURRENT_DATE,
  last_contacted_at DATE,
  next_follow_up DATE DEFAULT CURRENT_DATE,
  next_nurture_date DATE,
  history JSONB DEFAULT '[]'::jsonb,
  nurture_history JSONB DEFAULT '[]'::jsonb,
  pipeline_value NUMERIC DEFAULT 0,
  closed_value NUMERIC DEFAULT 0,
  closed_at DATE,
  assigned_to TEXT DEFAULT 'Leon',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message templates table (both outreach and nurture)
CREATE TABLE message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  step INTEGER NOT NULL,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'ig',
  delay_days INTEGER DEFAULT 0,
  body TEXT DEFAULT '',
  type TEXT DEFAULT 'outreach',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE message_templates;

-- Disable RLS (this is an internal team tool, no auth needed)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key
CREATE POLICY "Allow all on contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on message_templates" ON message_templates FOR ALL USING (true) WITH CHECK (true);

-- Insert default outreach messages
INSERT INTO message_templates (step, name, channel, delay_days, body, type) VALUES
(1, 'Initial DM', 'ig', 0, 'Hey {{name}}! I came across your content and love what you''re doing. I help [your niche] get [result] without [pain point]. Would you be open to a quick chat to see if I can help?', 'outreach'),
(2, 'Follow Up #1', 'ig', 3, 'Hey {{name}}, just bumping this up in case it got buried! I know you''re busy. Curious if you''d be open to hearing how I helped [similar person] get [specific result]?', 'outreach'),
(3, 'Follow Up #2', 'ig', 4, 'Hey {{name}}! Last one from me on here. Just wanted to share a quick case study: [Client] went from [before] to [after] in [timeframe]. If that sounds interesting, happy to share how. If not, no worries at all!', 'outreach'),
(4, 'Email Follow Up', 'email', 5, E'Subject: Quick question\n\nHey {{name}},\n\nI reached out on IG but figured I''d try email too. I help [niche] achieve [result] and thought you''d be a great fit.\n\nWould you be open to a 15 min call this week?\n\nBest,\n[Your Name]', 'outreach'),
(5, 'Final Follow Up', 'email', 7, E'Subject: Re: Quick question\n\nHey {{name}},\n\nJust circling back one last time. I know timing is everything, so if now isn''t right, totally understand.\n\nIf things change down the road, my door is always open.\n\nBest,\n[Your Name]', 'outreach');

-- Insert default nurture messages
INSERT INTO message_templates (step, name, channel, delay_days, body, type) VALUES
(1, 'Re-engage', 'ig', 0, 'Hey {{name}}! Thanks for getting back to me. I know life gets busy. Just wanted to check in and see if you had any questions about what I shared?', 'nurture'),
(2, 'Value Drop #1', 'ig', 3, 'Hey {{name}}, thought you''d find this interesting. I just helped [client] do [specific result] in [timeframe]. Here''s what we changed: [1-2 sentence insight]. Thought of you when I saw the results.', 'nurture'),
(3, 'Social Proof', 'ig', 3, 'Hey {{name}}! Quick story. [Client name] was in a similar spot to you. [1 sentence about their problem]. We [1 sentence about what you did]. Now they''re [result]. Just thought I''d share since I think you could see similar results.', 'nurture'),
(4, 'Soft Ask', 'ig', 4, 'Hey {{name}}, I''ve got a few spots opening up this month for [service]. If you''re still thinking about [goal], I''d love to hop on a quick 15 min call. No pressure, just want to see if it''s a fit. Would that work for you?', 'nurture'),
(5, 'Value Drop #2', 'ig', 4, 'Hey {{name}}! Came across something that made me think of you. [Share a relevant tip, article, or insight]. Hope that''s helpful whether we work together or not.', 'nurture'),
(6, 'Check-in', 'ig', 4, 'Hey {{name}}, just checking in. How''s [something relevant to their business] going? Would love to hear an update.', 'nurture'),
(7, 'Weekly Value #1', 'ig', 7, 'Hey {{name}}! Quick tip that''s been working great for our clients: [actionable tip]. Try it out and let me know how it goes!', 'nurture'),
(8, 'Weekly Value #2', 'ig', 7, 'Hey {{name}}, just wanted to share a win. [Client] just hit [milestone] using our [method/system]. Still think you''d be a great fit for this. Let me know if you ever want to chat about it.', 'nurture'),
(9, 'Weekly Check-in', 'ig', 7, 'Hey {{name}}! Hope you''re doing well. Just wanted to pop in and see how things are going on your end. Anything I can help with?', 'nurture'),
(10, 'Weekly Value #3', 'ig', 7, 'Hey {{name}}, here''s something I''ve been thinking about that might help you: [insight or framework]. Would love to hear your thoughts on it.', 'nurture');
