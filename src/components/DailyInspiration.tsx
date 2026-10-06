import { useEffect, useState } from "react";
import { Heart, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { text: string; ref: string };
type Mode = "quote" | "verse";

const QUOTES: Item[] = [
  { text: "Progress over perfection.", ref: "Unknown" },
  { text: "It always seems impossible until it's done.", ref: "Nelson Mandela" },
  { text: "The secret of getting ahead is getting started.", ref: "Mark Twain" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", ref: "Robert Collier" },
  { text: "Don't watch the clock; do what it does. Keep going.", ref: "Sam Levenson" },
  { text: "Education is the most powerful weapon which you can use to change the world.", ref: "Nelson Mandela" },
  { text: "The expert in anything was once a beginner.", ref: "Helen Hayes" },
  { text: "Discipline is choosing between what you want now and what you want most.", ref: "Abraham Lincoln (attr.)" },
  { text: "You don't have to be great to start, but you have to start to be great.", ref: "Zig Ziglar" },
  { text: "Believe you can and you're halfway there.", ref: "Theodore Roosevelt" },
  { text: "Small steps every day.", ref: "Unknown" },
  { text: "The beautiful thing about learning is nobody can take it away from you.", ref: "B.B. King" },
  { text: "Hard work beats talent when talent doesn't work hard.", ref: "Tim Notke" },
  { text: "Done is better than perfect.", ref: "Sheryl Sandberg" },
  { text: "Push yourself, because no one else is going to do it for you.", ref: "Unknown" },
  { text: "Learning never exhausts the mind.", ref: "Leonardo da Vinci" },
  { text: "Your future is created by what you do today, not tomorrow.", ref: "Robert Kiyosaki" },
  { text: "Great things never come from comfort zones.", ref: "Unknown" },
  { text: "Focus on being productive instead of busy.", ref: "Tim Ferriss" },
  { text: "Dream big. Start small. Act now.", ref: "Robin Sharma" },
  { text: "The only way to do great work is to love what you do.", ref: "Steve Jobs" },
  { text: "Fall seven times, stand up eight.", ref: "Japanese proverb" },
  { text: "A little progress each day adds up to big results.", ref: "Satya Nani" },
  { text: "Strive for progress, not perfection.", ref: "Unknown" },
  { text: "What we learn with pleasure we never forget.", ref: "Alfred Mercier" },
  { text: "Energy and persistence conquer all things.", ref: "Benjamin Franklin" },
  { text: "Quality is not an act, it is a habit.", ref: "Aristotle" },
  { text: "Start where you are. Use what you have. Do what you can.", ref: "Arthur Ashe" },
  { text: "Mistakes are proof that you are trying.", ref: "Unknown" },
  { text: "Stay curious.", ref: "Unknown" },
  { text: "You are capable of more than you know.", ref: "Unknown" },
];

const VERSES: Item[] = [
  { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
  { text: "Be strong and courageous. Do not be afraid; the Lord your God will be with you wherever you go.", ref: "Joshua 1:9" },
  { text: "For I know the plans I have for you, plans to prosper you and not to harm you, plans to give you hope and a future.", ref: "Jeremiah 29:11" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
  { text: "If any of you lacks wisdom, you should ask God, who gives generously to all.", ref: "James 1:5" },
  { text: "Commit to the Lord whatever you do, and he will establish your plans.", ref: "Proverbs 16:3" },
  { text: "Those who hope in the Lord will renew their strength. They will soar on wings like eagles.", ref: "Isaiah 40:31" },
  { text: "Do not be anxious about anything, but in every situation, by prayer and petition, present your requests to God.", ref: "Philippians 4:6" },
  { text: "Whatever you do, work at it with all your heart.", ref: "Colossians 3:23" },
  { text: "Let us not become weary in doing good, for at the proper time we will reap a harvest.", ref: "Galatians 6:9" },
  { text: "The fear of the Lord is the beginning of wisdom.", ref: "Proverbs 9:10" },
  { text: "Come to me, all you who are weary and burdened, and I will give you rest.", ref: "Matthew 11:28" },
  { text: "Cast all your anxiety on him because he cares for you.", ref: "1 Peter 5:7" },
  { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
  { text: "God is our refuge and strength, an ever-present help in trouble.", ref: "Psalm 46:1" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "And we know that in all things God works for the good of those who love him.", ref: "Romans 8:28" },
  { text: "Your word is a lamp for my feet, a light on my path.", ref: "Psalm 119:105" },
  { text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.", ref: "2 Timothy 1:7" },
  { text: "Plans fail for lack of counsel, but with many advisers they succeed.", ref: "Proverbs 15:22" },
  { text: "Do not conform to the pattern of this world, but be transformed by the renewing of your mind.", ref: "Romans 12:2" },
  { text: "The Lord will fight for you; you need only to be still.", ref: "Exodus 14:14" },
  { text: "This is the day the Lord has made; let us rejoice and be glad in it.", ref: "Psalm 118:24" },
  { text: "Fear not, for I am with you; be not dismayed, for I am your God.", ref: "Isaiah 41:10" },
  { text: "Wisdom is supreme; therefore get wisdom.", ref: "Proverbs 4:7" },
  { text: "My grace is sufficient for you, for my power is made perfect in weakness.", ref: "2 Corinthians 12:9" },
  { text: "Delight yourself in the Lord, and he will give you the desires of your heart.", ref: "Psalm 37:4" },
  { text: "Peace I leave with you; my peace I give you.", ref: "John 14:27" },
  { text: "Seek first his kingdom and his righteousness, and all these things will be given to you.", ref: "Matthew 6:33" },
  { text: "The joy of the Lord is your strength.", ref: "Nehemiah 8:10" },
  { text: "Let all that you do be done in love.", ref: "1 Corinthians 16:14" },
];

const MODE_KEY = "studynova:inspiration-mode";
const FAV_KEY = "studynova:inspiration-favs";

function dayIndex(d = new Date()) {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

export function DailyInspiration() {
  const [mode, setMode] = useState<Mode>("quote");
  const [shift, setShift] = useState(0);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "quote" || m === "verse") setMode(m);
      setFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"));
    } catch { /* ignore */ }
  }, []);

  const list = mode === "quote" ? QUOTES : VERSES;
  const item = list[(dayIndex() + shift) % list.length];
  const id = `${mode}:${item.ref}:${item.text.slice(0, 24)}`;
  const fav = favs.includes(id);
  const long = item.text.length > 70;

  function pick(m: Mode) {
    setMode(m);
    setShift(0);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }
  function toggleFav() {
    const next = fav ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  return (
    <div className="dash-motivation relative flex min-h-52 flex-col overflow-hidden rounded-[1.25rem] border border-border p-5">
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-background/40 p-0.5 text-xs font-semibold backdrop-blur">
          {(["quote", "verse"] as const).map((m) => (
            <button
              key={m}
              onClick={() => pick(m)}
              className={cn("rounded-full px-3 py-1 transition", mode === m ? "bg-background/80 text-foreground shadow" : "opacity-80 hover:opacity-100")}
            >
              {m === "quote" ? "Quotes" : "Bible Verse"}
            </button>
          ))}
        </div>
        <button onClick={() => setShift((s) => s + 1)} className="rounded-full bg-background/40 p-1.5 backdrop-blur hover:bg-background/60" aria-label="Show another">
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      <div key={id} className="relative z-10 flex flex-1 flex-col items-center justify-center py-4 text-center animate-in fade-in duration-500">
        <p className={cn("-rotate-3 font-display font-bold italic leading-tight", long ? "text-xl" : "text-3xl")}>
          {mode === "verse" ? `“${item.text}”` : item.text}
        </p>
        {item.ref !== "Unknown" ? (
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest opacity-80">— {item.ref}</p>
        ) : null}
      </div>
      <div className="relative z-10 flex items-center justify-between text-[11px] opacity-75">
        <span>{mode === "quote" ? "Quote of the day" : "Verse of the day"}</span>
        <button onClick={toggleFav} aria-label={fav ? "Remove favorite" : "Save favorite"}>
          <Heart className={cn("size-6 transition", fav && "fill-current scale-110")} />
        </button>
      </div>
    </div>
  );
}
