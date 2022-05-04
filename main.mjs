#!/usr/bin/env node
import 'dotenv/config'
import { Client as NotionClient } from "@notionhq/client";
import { ShortcutClient } from '@useshortcut/client';

const notionDatabaseName = process.env.NOTION_DATABASE_NAME;
const notionMilestonePropertyName = process.env.NOTION_DATABASE_PROPERTY_MILESTONE;
const notionProgressPropertyName = process.env.NOTION_DATABASE_PROPERTY_PROGRESS;
const notion = new NotionClient({auth: process.env.NOTION_TOKEN});
const shortcut = new ShortcutClient(process.env.SHORTCUT_TOKEN);

// Gets pages from the Notion `Roadmap` database which have the property `NOTION_ROADMAP_PROPERTY_MILESTONE` configured.
// Makes a map of the pages & milestones
// Gets the amount of stories done&total from the epics in the milestones in Shortcut which are mapped.
// Calculates the progress and updates the `NOTION_ROADMAP_PROPERTY_PROGRESS` property of the mapped pages

// @see https://developers.notion.com/reference/database
const notionDatabase = await getDatabaseByName(notionDatabaseName);

// @see https://developers.notion.com/reference/page
const notionPages = await getPagesFromDatabase(notionDatabase.id);

// [{"45ee8d13-687b-47ce-a5ca-6e2e45548c4b": 5119}, ...]
const pageMilestoneMap = createPageMilestoneMap(notionPages);

// [5119, ...]
const trackedMilestones = pageMilestoneMap.map(pair => pair.milestoneId);

// { 5119: {stories: 0, done: 0}, ... }
const milestoneStatsMap = await getMilestoneStatsFromShortcut(trackedMilestones);

// update each page with the progress of the milestone
for (const milestoneId in milestoneStatsMap) {
	const progress = Math.round(milestoneStatsMap[milestoneId].done / milestoneStatsMap[milestoneId].stories * 100);
	const pageId = pageMilestoneMap.find((pair) => milestoneId === pair.milestoneId.toString()).pageId;
	await updateProgressForPage(pageId, progress);
}

// functions
async function getMilestoneStatsFromShortcut(trackedMilestoneIds) {
	const stats = {};
	let milestones = (await shortcut.listMilestones()).data;
	milestones = milestones.filter(milestone => trackedMilestoneIds.includes(milestone.id));
	for (const milestone of milestones) {
		stats[milestone.id] = {stories: 0, done: 0};
		let epics = (await shortcut.listMilestoneEpics(milestone.id)).data;
		for (const epic of epics) {
			stats[milestone.id].stories += epic.stats.num_stories_total
			stats[milestone.id].done += epic.stats.num_stories_done
		}
	}
	return stats;
}

async function getDatabaseByName(name) {
	return (await notion.search({query: name})).results[0];
}

async function getPagesFromDatabase(roadmapDatabaseId) {
	return (await notion.databases.query({
		database_id: roadmapDatabaseId,
		filter: {
			property: notionMilestonePropertyName,
			number: {
				is_not_empty: true,
			},
		},
	})).results;
}

async function updateProgressForPage(pageId, progress) {
	return await notion.pages.update({
		page_id: pageId,
		properties: {
			[notionProgressPropertyName]: {
				number: progress,
			},
		},
	});
}

function createPageMilestoneMap(pages) {
	return pages.map(page => ({
		pageId: page.id,
		milestoneId: page.properties[notionMilestonePropertyName].number,
	}));
}
