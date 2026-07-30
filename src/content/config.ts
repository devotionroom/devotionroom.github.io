import { defineCollection, reference, z } from 'astro:content';

const lessons = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    passage: z.string().optional(),
    ageGroup: z.string().optional(),
    objective: z.string().optional(),
    memoryVerse: z.string().optional(),
    downloads: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    
    // Taxonomy
    topic: z.array(z.string()).default([]),
    series: z.string().optional(),
    book: z.string().optional(),
    estimatedTime: z.string().optional(),
    difficulty: z.string().optional(),

    // Relationships
    relatedDevotionals: z.array(reference('devotionals')).optional(),
    relatedSongs: z.array(reference('songs')).optional(),
    relatedResources: z.array(reference('resources')).optional(),
  }),
});

const devotionals = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    scripture: z.string().optional(),
    prayer: z.string().optional(),
    relatedPassages: z.array(z.string()).optional(),
    
    // Taxonomy
    topic: z.array(z.string()).default([]),
    series: z.string().optional(),
    book: z.string().optional(),
    
    // Relationships
    relatedLessons: z.array(reference('lessons')).optional(),
    relatedSongs: z.array(reference('songs')).optional(),
  }),
});

const songs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    bibleReference: z.string().optional(),
    youtubeId: z.string().optional(),
    description: z.string().optional(),
    thumbnail: z.string().optional(),
    heroVideo: z.string().optional(),
    featured: z.boolean().default(false),
    
    // Taxonomy
    category: z.string(),
    topic: z.array(z.string()).default([]),
    book: z.string().optional(),
    
    // Relationships
    relatedLessons: z.array(reference('lessons')).optional(),
  }),
});

const resources = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    category: z.string(),
    description: z.string().optional(),
    downloadLinks: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    
    // Taxonomy
    topic: z.array(z.string()).default([]),
    
    // Relationships
    relatedLessons: z.array(reference('lessons')).optional(),
  }),
});

export const collections = {
  lessons,
  devotionals,
  songs,
  resources,
};
