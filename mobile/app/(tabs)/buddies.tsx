import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, RefreshControl } from 'react-native';
import {
  Users, Search, UserPlus, Check, X, ChevronRight, Crown, LogOut,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../contexts/AuthContext';
import { useSocialStore } from '../../stores/socialStore';
import { useProfileStore } from '../../stores/profileStore';
import { Badge } from '../../components/ui';

export default function BuddiesScreen() {
  const { user } = useAuth();
  const { gymId } = useProfileStore();
  const {
    buddies, receivedRequests, sentRequests,
    groupRole, groupMembers,
    loadSocialData, loadGroupData,
    searchUsers, sendBuddyRequest,
    acceptBuddyRequest, declineBuddyRequest,
  } = useSocialStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadSocialData(user.id);
    if (gymId) loadGroupData(user.id, gymId);
  }, [user?.id, gymId]);

  const handleSearch = useCallback(async () => {
    if (!user?.id || searchQuery.trim().length < 2) return;
    setSearching(true);
    const results = await searchUsers(searchQuery.trim(), user.id);
    setSearchResults(results);
    setSearching(false);
  }, [user?.id, searchQuery]);

  const handleSendRequest = useCallback(async (receiverId: string) => {
    if (!user?.id) return;
    await sendBuddyRequest(user.id, receiverId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSearchResults((prev) => prev.filter((r) => r.user_id !== receiverId));
  }, [user?.id]);

  const handleAccept = useCallback(async (requestId: string) => {
    if (!user?.id) return;
    await acceptBuddyRequest(requestId, user.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [user?.id]);

  const handleDecline = useCallback(async (requestId: string) => {
    if (!user?.id) return;
    await declineBuddyRequest(requestId, user.id);
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    await loadSocialData(user.id);
    if (gymId) await loadGroupData(user.id, gymId);
    setRefreshing(false);
  }, [user?.id, gymId]);

  return (
    <ScrollView
      className="flex-1 bg-zinc-950"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
    >
      {/* Header */}
      <View>
        <Text className="text-zinc-50 text-2xl font-bold">Buddies</Text>
        <Text className="text-zinc-500 text-sm">Friends and workout groups</Text>
      </View>

      {/* Search */}
      <View className="flex-row items-center bg-zinc-900 rounded-xl border border-zinc-800 px-3">
        <Search size={18} color="#71717a" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          placeholder="Search users by name or email"
          placeholderTextColor="#71717a"
          returnKeyType="search"
          className="flex-1 text-zinc-100 py-3 px-2 text-base"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
            <X size={18} color="#71717a" />
          </Pressable>
        )}
      </View>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <Text className="text-zinc-400 text-xs font-semibold px-4 pt-3 pb-2">SEARCH RESULTS</Text>
          {searchResults.map((result) => (
            <View key={result.user_id} className="flex-row items-center justify-between px-4 py-3 border-t border-zinc-800/50">
              <View className="flex-row items-center flex-1">
                <Text className="text-2xl mr-3">{result.avatar || '💪'}</Text>
                <View>
                  <Text className="text-zinc-100 font-medium">{result.name}</Text>
                  <Text className="text-zinc-500 text-xs">{result.email}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => handleSendRequest(result.user_id)}
                className="bg-orange-500 px-3 py-1.5 rounded-lg flex-row items-center"
              >
                <UserPlus size={14} color="white" />
                <Text className="text-white text-xs font-semibold ml-1">Add</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Pending Requests */}
      {receivedRequests.length > 0 && (
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <Text className="text-zinc-400 text-xs font-semibold px-4 pt-3 pb-2">
            PENDING REQUESTS ({receivedRequests.length})
          </Text>
          {receivedRequests.map((req) => (
            <View key={req.request_id} className="flex-row items-center justify-between px-4 py-3 border-t border-zinc-800/50">
              <View className="flex-row items-center flex-1">
                <Text className="text-2xl mr-3">{req.sender_avatar || '💪'}</Text>
                <Text className="text-zinc-100 font-medium">{req.sender_name}</Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => handleAccept(req.request_id)}
                  className="bg-green-500/20 p-2 rounded-lg"
                >
                  <Check size={16} color="#4ade80" />
                </Pressable>
                <Pressable
                  onPress={() => handleDecline(req.request_id)}
                  className="bg-zinc-800 p-2 rounded-lg"
                >
                  <X size={16} color="#a1a1aa" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Group Members */}
      {groupMembers.length > 0 && (
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
            <Text className="text-zinc-400 text-xs font-semibold">WORKOUT GROUP</Text>
            {groupRole && <Badge text={groupRole} variant="orange" />}
          </View>
          {groupMembers.map((member: any) => (
            <View key={member.user_id} className="flex-row items-center px-4 py-3 border-t border-zinc-800/50">
              <Text className="text-2xl mr-3">{member.avatar || '💪'}</Text>
              <View className="flex-1">
                <Text className="text-zinc-100 font-medium">{member.name}</Text>
                <Text className="text-zinc-500 text-xs">{member.role}</Text>
              </View>
              {member.role === 'owner' && <Crown size={16} color="#f97316" />}
            </View>
          ))}
        </View>
      )}

      {/* Buddies List */}
      {buddies.length > 0 ? (
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <Text className="text-zinc-400 text-xs font-semibold px-4 pt-3 pb-2">
            BUDDIES ({buddies.length})
          </Text>
          {buddies.map((buddy: any) => (
            <View key={buddy.buddy_id} className="flex-row items-center px-4 py-3 border-t border-zinc-800/50">
              <Text className="text-2xl mr-3">{buddy.buddy_avatar || '💪'}</Text>
              <View className="flex-1">
                <Text className="text-zinc-100 font-medium">{buddy.buddy_name}</Text>
                <Text className="text-zinc-500 text-xs">{buddy.buddy_email}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : searchResults.length === 0 && receivedRequests.length === 0 && (
        <View className="items-center py-12">
          <View className="w-16 h-16 bg-zinc-800 rounded-2xl items-center justify-center mb-4">
            <Users size={32} color="#f97316" />
          </View>
          <Text className="text-zinc-50 text-xl font-bold text-center">No buddies yet</Text>
          <Text className="text-zinc-400 text-sm text-center mt-2">
            Search for friends to connect with.
          </Text>
        </View>
      )}

      <View className="h-4" />
    </ScrollView>
  );
}
