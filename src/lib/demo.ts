import type { DayRecord, Lang } from './types'
import { addDays, todayKey } from './date'

/** An earlier year of the sample, for the same month and day. */
export interface DemoPastYear {
  year: number
  record: DayRecord
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Two earlier years of the sample on the same date, so the past-years block can
 * be read before anyone has a history. Like the rest of the sample, it is built
 * on demand and never written to the saved store.
 */
export function demoPastRecords(date: string, lang: Lang): DemoPastYear[] {
  const [year, month, day] = date.split('-').map(Number)
  const years: DemoPastYear[] = []
  for (const back of [1, 2]) {
    const pastYear = year - back
    if (month === 2 && day === 29 && !isLeapYear(pastYear)) continue
    years.push({ year: pastYear, record: samplePastYear(back, lang) })
  }
  return years
}

function samplePastYear(back: number, lang: Lang): DayRecord {
  if (lang === 'ko') {
    return back === 1
      ? {
          a: {
            gratitude: '이사 온 첫 저녁, 박스 더미 사이에 앉아 이 앱을 처음 켰다.',
            meditation: '“내가 평안히 눕고 자기도 하리니.” 낯선 집에서 읽으니 그 말씀이 더 가까웠다.',
            prayer: '낯선 동네에서도 우리가 먼저 서로에게 집이 되게 해 주세요.',
          },
          b: {
            gratitude: '짐을 다 풀지 못했는데도 웃으면서 저녁을 먹은 일.',
            meditation: '같은 말씀을 읽는데 남편은 잠을, 나는 이 집을 떠올렸다.',
            prayer: '이 집에서 울고 웃을 모든 날을 함께 지켜 주세요.',
          },
        }
      : {
          a: {
            gratitude: '늦게 들어와 미안하다고 했더니 밥부터 먹자고 했다.',
            meditation: '감사는 기분이 아니라 습관이라는 말을 오늘에야 알아들었다.',
            prayer: '지치고 서운한 날에도 짧게라도 말을 잇게 해 주세요.',
          },
          b: {
            gratitude: '미안하다는 한마디가 오히려 고마웠던 밤.',
            meditation: '적어 둔 기도는 나중에 응답을 알아보게 된다는 것.',
            prayer: '작은 서운함이 오래 쌓이지 않게 해 주세요.',
          },
        }
  }
  return back === 1
    ? {
        a: {
          gratitude: 'Our first evening in the new place, sitting among the boxes with this page open.',
          meditation: '“I will lie down and sleep in peace.” In an unfamiliar house the words came closer.',
          prayer: 'In a strange neighborhood, let us be home for each other first.',
        },
        b: {
          gratitude: 'Laughing over dinner with half the boxes still unpacked.',
          meditation: 'The same verse made him think of sleep, and me of this house.',
          prayer: 'Keep us through every day this house will hold.',
        },
      }
    : {
        a: {
          gratitude: 'I came home late to apologize, and she said eat first.',
          meditation: 'Gratitude is a habit before it is a feeling. I only heard that today.',
          prayer: 'On the tired and hurt days, let us still find the words.',
        },
        b: {
          gratitude: 'An apology offered badly, and still worth more than dinner.',
          meditation: 'A prayer written down is one you can later recognize as answered.',
          prayer: 'Keep the small hurts from settling in.',
        },
      }
}

/**
 * A reading sample, kept out of the saved store. It fills the same shape the
 * real record uses so the page can be tried without signing, syncing or saving.
 */
export function demoRecord(date: string, lang: Lang): DayRecord | null {
  const today = todayKey()
  const yesterday = addDays(today, -1)
  if (date !== today && date !== yesterday) return null

  if (lang === 'ko') {
    return {
      a: {
        gratitude:
          date === today
            ? '퇴근길에 아내가 좋아하는 빵을 샀다. 별일 아닌데 같이 웃으며 먹은 저녁이 오래 남을 것 같다.'
            : '늦게 들어온 날에도 현관 불을 켜 두고 기다려 준 마음.',
        meditation:
          date === today
            ? '“내가 평안히 눕고 자기도 하리니.” 오늘은 잘 끝내는 일도 믿음이라는 생각이 들었다.'
            : '잠언의 말씀처럼, 내 계획보다 하나님의 뜻이 온전히 서는 하루였기를.',
        prayer:
          date === today
            ? '서로 지친 날에도 짧게라도 마음을 나눌 수 있게 해 주세요.'
            : '내일 아침, 두 사람 모두 가벼운 마음으로 눈뜨게 해 주세요.',
      },
      b: {
        gratitude:
          date === today
            ? '남편이 아무 말 없이 챙겨 준 따뜻한 차 한 잔. 서툰데 다정한 사람이라 고맙다.'
            : '오늘 하루도 무사히 지나가게 해 주셔서 감사합니다.',
        meditation:
          date === today
            ? '말씀을 함께 읽으니 같은 구절에서 서로 다른 위로를 받는다는 게 신기하다.'
            : '기도는 길게 하는 것이 아니라 자주 하는 것이라는 말이 마음에 남았다.',
        prayer:
          date === today ? '남편의 다음 한 주가 조금 가볍기를, 잠은 깊기를.' : '우리 가정에 평안을 주세요.',
      },
    }
  }

  return {
    a: {
      gratitude:
        date === today
          ? 'I stopped for the bread she likes on the way home. Nothing much, but laughing over dinner is what I will remember.'
          : 'She left the porch light on and waited, even on a late night.',
      meditation:
        date === today
          ? '“I will lie down and sleep in peace.” Ending the day well is its own kind of faith.'
          : 'That the Lord’s purpose stands, even when my plans do not.',
      prayer:
        date === today
          ? 'Help us share even a little of the tired days, out loud.'
          : 'A light morning for both of us, and a gentle start.',
    },
    b: {
      gratitude:
        date === today
          ? 'A warm cup of tea set down without a word. Clumsy, kind, and worth thanking God for.'
          : 'For a day that passed without harm.',
      meditation:
        date === today
          ? 'Reading together, the same verse comforts each of us differently. I like that.'
          : 'Prayer is not long, it is often. That stayed with me.',
      prayer: date === today ? 'For his next week to be lighter, and his sleep deep.' : 'Peace for our home.',
    },
  }
}

