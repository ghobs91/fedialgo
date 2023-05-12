import { mastodon } from "masto";
import { FeedFetcher, Scorer, StatusType, weightsType } from "./types";
import {
    favsFeatureScorer,
    interactsFeatureScorer,
    reblogsFeatureScorer,
    diversityFeedScorer,
    reblogsFeedScorer,
    FeatureScorer,
    FeedScorer
} from "./scorer";
import weightsStore from "./weights/weightsStore";
import getHomeFeed from "./feeds/homeFeed";
import topPostsFeed from "./feeds/topPostsFeed";
import Storage from "./Storage";

export default class TheAlgorithm {
    user: mastodon.v1.Account;
    fetchers = [getHomeFeed, topPostsFeed]
    featureScorer = [new favsFeatureScorer(), new reblogsFeatureScorer()]
    feedScorer = [new reblogsFeedScorer(), new diversityFeedScorer()]
    feed: StatusType[] = [];
    api: mastodon.Client;
    constructor(api: mastodon.Client, user: mastodon.v1.Account, valueCalculator: (((scores: weightsType) => Promise<number>) | null) = null) {
        this.api = api;
        this.user = user;
        Storage.setIdentity(user);
        if (valueCalculator) {
            this._getValueFromScores = valueCalculator;
        }
    }

    async getFeedAdvanced(
        fetchers: Array<FeedFetcher>,
        featureScorer: Array<FeatureScorer>,
        feedScorer: Array<FeedScorer>
    ) {
        this.fetchers = fetchers;
        this.featureScorer = featureScorer;
        this.feedScorer = feedScorer;
        return this.getFeed();
    }

    async getFeed(): Promise<StatusType[]> {
        const { fetchers, featureScorer, feedScorer } = this;
        const response = await Promise.all(fetchers.map(fetcher => fetcher(this.api, this.user)))
        this.feed = response.flat();

        // Load and Prepare Features
        await Promise.all(featureScorer.map(scorer => scorer.getFeature(this.api)));
        await Promise.all(feedScorer.map(scorer => scorer.setFeed(this.feed)));

        // Get Score Names
        const scoreNames = featureScorer.map(scorer => scorer.verboseName);
        const feedScoreNames = feedScorer.map(scorer => scorer.getVerboseName());

        // Score Feed
        let scoredFeed: StatusType[] = []
        for (const status of this.feed) {
            // Load Scores for each status
            const featureScore = await Promise.all(featureScorer.map(scorer => scorer.score(this.api, status)));
            const feedScore = await Promise.all(feedScorer.map(scorer => scorer.score(status)));

            // Turn Scores into Weight Objects
            const featureScoreObj = this._getScoreObj(scoreNames, featureScore);
            const feedScoreObj = this._getScoreObj(feedScoreNames, feedScore);
            const scoreObj = { ...featureScoreObj, ...feedScoreObj };

            // Add Weight Object to Status
            status["scores"] = scoreObj;
            status["value"] = await this._getValueFromScores(scoreObj);
            scoredFeed.push(status);
        }

        // Remove Replies, Stuff Already Retweeted, and Nulls
        scoredFeed = scoredFeed
            .filter((item: StatusType) => item != undefined)
            .filter((item: StatusType) => item.inReplyToId === null)
            .filter((item: StatusType) => item.content.includes("RT @") === false)
            .filter((item: StatusType) => !item.reblogged)


        // Add Time Penalty
        scoredFeed.map((item: StatusType) => {
            const seconds = Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000);
            const timediscount = Math.pow((1 + 0.7 * 0.2), -Math.pow((seconds / 3600), 2));
            item.value = (item.value ?? 0) * timediscount
        })

        // Sort Feed
        scoredFeed = scoredFeed.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        //Remove duplicates
        scoredFeed = [...new Map(scoredFeed.map((item: StatusType) => [item["uri"], item])).values()];

        this.feed = scoredFeed
        console.log(this.feed);
        return this.feed;
    }

    private _getScoreObj(scoreNames: string[], scores: number[]): weightsType {
        return scoreNames.reduce((obj: weightsType, cur, i) => {
            obj[cur] = scores[i];
            return obj;
        }, {});
    }

    private async _getValueFromScores(scores: weightsType): Promise<number> {
        const weights = await weightsStore.getWeightsMulti(Object.keys(scores));
        const weightedScores = Object.keys(scores).reduce((obj: number, cur) => {
            obj = obj + (scores[cur] * weights[cur] ?? 0)
            return obj;
        }, 0);
        return weightedScores;
    }

    async getWeights(): Promise<weightsType> {
        const verboseNames = [...this.featureScorer.map(scorer => scorer.verboseName), ...this.feedScorer.map(scorer => scorer.getVerboseName())];
        const weights = await weightsStore.getWeightsMulti(verboseNames);
        return weights;
    }

    async setWeights(weights: weightsType): Promise<StatusType[]> {
        await weightsStore.setWeightsMulti(weights);
        const scoredFeed: StatusType[] = []
        for (const status of this.feed) {
            if (!status["scores"]) {
                return this.getFeed();
            }
            status["value"] = await this._getValueFromScores(status["scores"]);
            scoredFeed.push(status);
        }
        this.feed = scoredFeed.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        return this.feed;
    }
}