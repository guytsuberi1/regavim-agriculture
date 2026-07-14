# ניהול עבודה חקלאית — רגבים בנימין

אפליקציית ניהול העבודה החקלאית של ישיבת רגבים בנימין.

🌐 **האתר החי:** https://chaklaut.rgvb.org.il

## מבנה

```
agri-site/            האתר עצמו — מתפרסם אוטומטית ל-GitHub Pages בכל push שנוגע בו
  index.html
  styles.css
  js/                 קוד האפליקציה
supabase/             פונקציות ענן
ניהול-חקלאות/         הגרסה הישנה (רצה מקבצים מקומיים) — לא בשימוש, נשמרת לתיעוד
.github/workflows/    פרסום אוטומטי ל-GitHub Pages
```

## פיתוח

- אין build — עורכים את הקבצים ב-`agri-site/` ודוחפים; האתר מתעדכן אוטומטית.
- הנתונים והאימות ב-Supabase (אותו פרויקט של אפליקציות התקציב והפנימייה).

## אפליקציות אחיות

- [regavim-budget](https://github.com/guytsuberi1/regavim-budget) — ניהול תקציב
- [regavim-dorm](https://github.com/guytsuberi1/regavim-dorm) — ניהול פנימייה
