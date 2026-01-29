// import { usePowerSync, useQuery } from "@powersync/react-native";
// import { ThoughtRecord } from "@/powersync/AppSchema";
// import { useSupabase } from "@/powersync/SystemProvider";
import React  from "react";
import {
  View,
  Dimensions
} from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
import BenchmarkScreen from "./benchmark";

// const { width } = Dimensions.get('window');

// type EmojiCounter = { emoji: string, count: number }
// const commonEmojis = ["❤️", "👍", "😂", "😊", "🔥", "💯", "🚀", "💡", "🌟", "👏"];

// function ThoughtReactions({ thoughtId }) {
//   const [showEmojiPicker, setShowEmojiPicker] = useState(false);
//   const powersync = usePowerSync();
//   const connector = useSupabase();

//   // Query reactions grouped by emoji with counts
//   const { data: reactionGroups } = useQuery<EmojiCounter>(
//        /* sql */ `
//       SELECT
//         emoji,
//         COUNT(*) as count
//       FROM
//         reactions
//       WHERE
//         thought_id = ?
//       GROUP BY
//         emoji
//     `,
//     [thoughtId]
//   );

//   const handleAddReaction = async (emoji: string) => {
//     try {

//       await powersync.execute(
//         /* sql */ `
//           INSERT INTO
//             reactions (id, thought_id, user_id, emoji, created_at)
//           VALUES
//             (uuid(), ?, ?, ?, datetime())
//         `,
//         [thoughtId, connector.userId, emoji]
//       );
//       setShowEmojiPicker(false);
//     } catch (error) {
//       console.error("Error adding reaction:", error);
//     }
//   };

//   return (
//     <>
//       {/* Reactions Section */}
//       <View className="flex-row justify-between items-center">
//         <View className="flex-row flex-wrap flex-1">
//           {reactionGroups.map((group) => (
//             <View key={group.emoji} className="flex-row items-center bg-gray-100 rounded-full px-3 py-1.5 mr-2 mb-1">
//               <Text className="text-base">{group.emoji}</Text>
//               {group.count > 1 ? (
//                 <Text className="text-sm text-gray-600 ml-1">{group.count}</Text>
//               ) : null}
//             </View>
//           ))}
//         </View>

//         {/* Add Reaction Button */}
//         <TouchableOpacity
//           className="flex-row items-center bg-gray-100 rounded-full px-3 py-1.5"
//           onPress={() => setShowEmojiPicker(!showEmojiPicker)}
//         >
//           <Text className="text-sm text-gray-600">😊 React</Text>
//         </TouchableOpacity>
//       </View>

//       {/* Emoji Picker */}
//       {showEmojiPicker && (
//         <View className="mt-3 bg-white rounded-xl p-3 border border-gray-200">
//           <View className="flex-row flex-wrap justify-between">
//             {commonEmojis.map((emoji) => (
//               <TouchableOpacity
//                 key={emoji}
//                 className="justify-center items-center rounded-lg mb-1 h-10"
//                 style={{ width: width * 0.15 }}
//                 onPress={() => handleAddReaction(emoji)}
//               >
//                 <Text className="text-2xl">{emoji}</Text>
//               </TouchableOpacity>
//             ))}
//           </View>
//         </View>
//       )}
//     </>
//   );
// }

export default function ThoughtsApp() {
  // const { top } = useSafeAreaInsets();
  // const [showNewThought, setShowNewThought] = useState(false);
  // const [newThoughtContent, setNewThoughtContent] = useState("");

  // const powersync = usePowerSync();
  // const connector = useSupabase();

  // // Query all thoughts
  // const { data: thoughts } = useQuery<ThoughtRecord>(/* sql */ `
  //   SELECT
  //     *
  //   FROM
  //     thoughts
  // `);

  // const handleAddThought = async () => {
  //   if (newThoughtContent.trim()) {
  //     try {
  //       await powersync.execute(
  //         /* sql */ `
  //           INSERT INTO
  //             thoughts (id, content, created_at, created_by)
  //           VALUES
  //             (uuid(), ?, datetime(), ?)
  //         `,
  //         [newThoughtContent.trim(), connector.userId]
  //       );
  //       setNewThoughtContent("");
  //       setShowNewThought(false);
  //     } catch (error) {
  //       console.error("Error adding thought:", error);
  //     }
  //   }
  // };

  // const handleDeleteThought = async (thoughtId: string) => {
  //   try {
  //     // Delete all reactions for this thought first
  //     await powersync.execute(
  //       /* sql */ `
  //         DELETE FROM reactions
  //         WHERE
  //           thought_id = ?
  //       `,
  //       [thoughtId]
  //     );
  //     // Then delete the thought
  //     await powersync.execute(
  //       /* sql */ `
  //         DELETE FROM thoughts
  //         WHERE
  //           id = ?
  //       `,
  //       [thoughtId]
  //     );
  //   } catch (error) {
  //     console.error("Error deleting thought:", error);
  //   }
  // };

  return (
    <View className="flex-1 bg-gray-50">
      <BenchmarkScreen/>
    </View>
  );
}